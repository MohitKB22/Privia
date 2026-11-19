/**
 * Run a tool from a button, with the same gates the assistant goes through.
 *
 * * A consequential action returns CONFIRMATION_REQUIRED with a full preview.
 *   The dialog shows it, and approving re-sends the *same* arguments with the
 *   confirmation id: the backend binds approval to session, tool and arguments.
 * * A missing permission is shown in place with an "Allow" button, then the
 *   action is retried. Nothing is granted without the user pressing it.
 */

import { useCallback, useState } from 'react';
import { ApiRequestError, api } from '@/lib/api';
import { pushToast } from '@/lib/store';
import type { ConfirmationRequest, PermissionPrompt as Prompt, ToolResult } from '@/lib/types';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { PermissionPrompt } from '@/components/PermissionPrompt';

type Pending = { tool: string; args: Record<string, unknown> };

export function useToolRunner(onDone?: (result: ToolResult) => void) {
  const [confirmation, setConfirmation] = useState<ConfirmationRequest | null>(null);
  const [permission, setPermission] = useState<Prompt | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);

  const run = useCallback(
    async (
      tool: string,
      args: Record<string, unknown>,
      confirmationId?: string,
      options: { quiet?: boolean } = {},
    ): Promise<ToolResult | null> => {
      setBusy(true);
      try {
        const result = await api.execute(tool, args, confirmationId);
        if (!result.success) {
          const details = (result.metadata?.details ?? {}) as Record<string, unknown>;
          if (result.error_code === 'TOOL_PERMISSION_DENIED' && details.decision === 'prompt') {
            setPending({ tool, args });
            setPermission({
              tool_name: tool,
              missing_scopes: (details.missing_scopes as string[]) ?? [],
              resources: (details.resources as string[]) ?? [],
              out_of_scope_resources: (details.out_of_scope_resources as string[]) ?? [],
              rationale: result.error ?? 'PRIVIA needs your permission for this.',
            });
          } else if (!options.quiet) {
            pushToast({ kind: 'error', title: result.error ?? 'That did not work' });
          }
          return result;
        }
        setConfirmation(null);
        setPending(null);
        onDone?.(result);
        return result;
      } catch (caught) {
        if (caught instanceof ApiRequestError && caught.isConfirmation) {
          const request = caught.details.confirmation as ConfirmationRequest | undefined;
          if (request) {
            setConfirmation(request);
            setPending({ tool, args });
            return null;
          }
        }
        pushToast({
          kind: 'error',
          title: 'That was refused',
          detail: caught instanceof Error ? caught.message : undefined,
        });
        return null;
      } finally {
        setBusy(false);
      }
    },
    [onDone],
  );

  const allow = async (scopes: string[], resources: string[]) => {
    try {
      for (const scope of scopes) await api.setPermission(scope, true, resources);
      setPermission(null);
      if (pending) await run(pending.tool, pending.args);
    } catch (caught) {
      pushToast({
        kind: 'error',
        title: 'Could not grant that',
        detail: (caught as Error).message,
      });
    }
  };

  const dialog = (
    <>
      {confirmation ? (
        <ConfirmDialog
          request={confirmation}
          busy={busy}
          onApprove={() => {
            if (pending) void run(pending.tool, pending.args, confirmation.id);
          }}
          onReject={() => {
            setConfirmation(null);
            setPending(null);
          }}
        />
      ) : null}
      {permission ? (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-6"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg animate-slide-up">
            <PermissionPrompt
              prompt={permission}
              busy={busy}
              onAllow={(scopes, resources) => void allow(scopes, resources)}
              onDeny={() => {
                setPermission(null);
                setPending(null);
              }}
            />
          </div>
        </div>
      ) : null}
    </>
  );

  return { run, dialog, busy };
}
