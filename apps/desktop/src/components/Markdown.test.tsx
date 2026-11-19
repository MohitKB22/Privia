import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Markdown } from './Markdown';

vi.mock('@/lib/connection', () => ({ openExternal: vi.fn() }));

describe('Markdown replies', () => {
  it('renders formatting, lists and fenced code with a copy button', () => {
    render(
      <Markdown text={'**Bold** and `code`\n\n- one\n- two\n\n```python\nprint("hi")\n```'} />,
    );
    expect(screen.getByText('Bold').tagName).toBe('STRONG');
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('python')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy code' })).toBeInTheDocument();
  });

  it('never renders raw HTML from a reply', () => {
    const { container } = render(
      <Markdown text={'<img src=x onerror="alert(1)"><script>alert(2)</script>hello'} />,
    );
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
  });

  it('opens links in the system browser instead of navigating the app', async () => {
    const { openExternal } = await import('@/lib/connection');
    render(<Markdown text={'[docs](https://example.com/docs)'} />);
    const link = screen.getByRole('link', { name: 'docs' });
    const event = fireEvent.click(link);
    expect(event).toBe(false); // default navigation prevented
    expect(openExternal).toHaveBeenCalledWith('https://example.com/docs');
  });

  it('strips script URLs', () => {
    render(<Markdown text={'[click](javascript:alert(1))'} />);
    expect(screen.getByText('click').getAttribute('href') ?? '').not.toMatch(/javascript:/i);
  });

  it('does not load remote images, which could track the reader', () => {
    const { container } = render(<Markdown text={'![pixel](https://tracker.example/p.gif)'} />);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText(/image: pixel/)).toBeInTheDocument();
  });
});
