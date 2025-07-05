package main

import (
	"log"
	"net/http"
)

// helloHandler responds with "Hello World"
func helloHandler(w http.ResponseWriter, r *http.Request) {
	w.Write([]byte("Hello World"))
}

// healthHandler responds with "OK" and HTTP 200
func healthHandler(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
	w.Write([]byte("OK"))
}

func main() {
	// Register handlers
	http.HandleFunc("/", helloHandler)
	http.HandleFunc("/health", healthHandler)

	// Start server on port 8080
	log.Println("Server starting on port 8080")
	log.Fatal(http.ListenAndServe(":8080", nil))
}
