
const express = require("express");
const path = require("path");
require("dotenv").config();

const app = express();

const PORT = process.env.PORT || 3000;

// Allow the server to receive JSON data
app.use(express.json());

// Serve website files
app.use(express.static(__dirname));

// Home page
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

// Test API route
app.get("/api/health", (req, res) => {
    res.json({
        status: "success",
        message: "CareerPath Finder server is running!"
    });
});

// Start the server
app.listen(PORT, () => {
    console.log(
        `CareerPath Finder server running on port ${PORT}`
    );
});
