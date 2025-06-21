use wasm_bindgen::prelude::*;
use serde::{Deserialize, Serialize};

// Import the `console.log` function from the Web API
#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console)]
    fn log(s: &str);
}

// Define a macro to provide `println!(..)`-style syntax
macro_rules! console_log {
    ($($t:tt)*) => (log(&format_args!($($t)*).to_string()))
}

#[derive(Serialize, Deserialize)]
pub struct Point {
    pub x: f64,
    pub y: f64,
}

#[derive(Serialize, Deserialize)]
pub struct ProcessingResult {
    pub message: String,
    pub value: f64,
    pub processed_at: f64,
}

#[wasm_bindgen]
pub fn greet(name: &str) -> String {
    console_log!("Hello from WASM! Greeting {}", name);
    console_log!("I AM A GREAT FISHCAKE");
    console_log!("I AM A GREAT FISHCAKE");
    console_log!("I AM A GREAT FISHCAKE");
    console_log!("I AM A GREAT FISHCAKE");
    format!("Hello, {}! This message comes from WebAssembly.", name)
}

#[wasm_bindgen]
pub fn add(a: i32, b: i32) -> i32 {
    console_log!("I AM A GREAT FISHCAKE");
    console_log!("Adding {} + {} in WASM", a, b);
    a + b
}

#[wasm_bindgen]
pub fn fibonacci(n: u32) -> u32 {
    console_log!("Computing fibonacci({}) in WASM", n);
    console_log!("I AM A GREAT FISHCAKE");
    match n {
        0 => 0,
        1 => 1,
        _ => fibonacci(n - 1) + fibonacci(n - 2),
    }
}

#[wasm_bindgen]
pub fn process_data(data: &JsValue) -> Result<JsValue, JsValue> {
    console_log!("Processing data in WASM");
    
    // Parse the input data
    let point: Point = serde_wasm_bindgen::from_value(data.clone())?;
    
    // Simulate some processing
    let distance = (point.x * point.x + point.y * point.y).sqrt();
    
    let result = ProcessingResult {
        message: format!("Processed point ({}, {})", point.x, point.y),
        value: distance,
        processed_at: js_sys::Date::now(),
    };
    
    // Return the result as a JavaScript value
    Ok(serde_wasm_bindgen::to_value(&result)?)
}

#[wasm_bindgen]
pub fn matrix_multiply(a: &[f64], b: &[f64], size: usize) -> Vec<f64> {
    console_log!("Matrix multiplication in WASM: {}x{}", size, size);
    
    let mut result = vec![0.0; size * size];
    
    for i in 0..size {
        for j in 0..size {
            for k in 0..size {
                result[i * size + j] += a[i * size + k] * b[k * size + j];
            }
        }
    }
    
    result
}

// Called when the WASM module is instantiated
#[wasm_bindgen(start)]
pub fn main() {
    console_log!("WASM module initialized successfully!");
}
