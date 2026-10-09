//! Sistema de Gestión Odontológica — app de escritorio (fase 11).
//!
//! Wrapper mínimo de `apps/web` sobre el mismo backend (SDD §2.1): no hay
//! lógica de negocio en Rust; todo vive en la web y en la API.

// En release no se muestra la consola de Windows.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error mientras se ejecutaba la aplicación de escritorio");
}
