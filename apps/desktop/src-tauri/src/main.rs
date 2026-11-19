// PRIVIA desktop shell entry point. See lib.rs.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    privia_lib::run();
}
