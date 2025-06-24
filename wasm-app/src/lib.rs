use wasm_bindgen::prelude::*;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use hex;

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
pub struct FileMetadata {
    pub name: String,
    pub size: usize,
    pub file_type: String,
}

#[derive(Serialize, Deserialize)]
pub struct ChunkInfo {
    pub index: usize,
    pub offset: usize,
    pub length: usize,
    pub hash: String,
}

#[derive(Serialize, Deserialize)]
pub struct ProcessedFileResult {
    pub hash: String,
    pub metadata: FileMetadata,
    pub chunk_size: usize,
    pub chunks: Vec<ChunkInfo>,
}

#[wasm_bindgen]
pub fn process_file(
    file_bytes: &[u8],
    name: &str,
    file_type: &str,
    chunk_size: usize,
) -> Result<JsValue, JsValue> {
    console_log!("Processing file in WASM: {} ({} bytes)", name, file_bytes.len());

    // Hash the whole file
    let mut hasher = Sha256::new();
    hasher.update(file_bytes);
    let hash = hex::encode(hasher.finalize());

    // Metadata
    let metadata = FileMetadata {
        name: name.to_string(),
        size: file_bytes.len(),
        file_type: file_type.to_string(),
    };

    // Chunking
    let mut chunks = Vec::new();
    let mut offset = 0;
    let mut index = 0;
    while offset < file_bytes.len() {
        let end = usize::min(offset + chunk_size, file_bytes.len());
        let chunk = &file_bytes[offset..end];
        // Hash each chunk
        let mut chunk_hasher = Sha256::new();
        chunk_hasher.update(chunk);
        let chunk_hash = hex::encode(chunk_hasher.finalize());
        chunks.push(ChunkInfo {
            index,
            offset,
            length: chunk.len(),
            hash: chunk_hash,
        });
        offset = end;
        index += 1;
    }

    let result = ProcessedFileResult {
        hash,
        metadata,
        chunk_size,
        chunks,
    };

    Ok(serde_wasm_bindgen::to_value(&result)?)
}

/// Skeleton for future compression. Currently returns the input chunk unchanged.
#[wasm_bindgen]
pub fn compress_chunk(chunk: &[u8]) -> Vec<u8> {
    // TODO: Implement compression (e.g., flate2, lz4)
    console_log!("compress_chunk called (skeleton, no compression yet)");
    chunk.to_vec()
}

// Called when the WASM module is instantiated
#[wasm_bindgen(start)]
pub fn main() {
    console_log!("WASM module initialized successfully!");
}
