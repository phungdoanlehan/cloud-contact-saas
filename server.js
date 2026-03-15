// ======================= LOAD ENVIRONMENT VARIABLES =======================
// Load environment variables from .env file into process.env [cite: 93, 110]
require("dotenv").config();

// ======================= IMPORT REQUIRED LIBRARIES =======================
const express = require("express");
const mysql = require("mysql2/promise");
const twilio = require("twilio");
const sgMail = require("@sendgrid/mail");
const path = require("path");

// ======================= INITIALIZE EXPRESS APP =======================
const app = express();

// ======================= MIDDLEWARE =======================
// Parse JSON and form data [cite: 92]
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Set view engine to EJS [cite: 92]
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// ======================= CONFIGURE SENDGRID =======================
// Use the SG API Key and Sender Email from .env [cite: 102, 103]
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// ======================= CONFIGURE TWILIO =======================
// Use the Twilio SID and Token from .env [cite: 99, 100]
const twilioClient = twilio(
  process.env.TWILIO_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// ======================= GLOBAL DATABASE CONNECTION =======================
let db;

// ======================= DATABASE INITIALIZATION FUNCTION =======================
// This function creates the database and table if they do not already exist [cite: 111]
async function initDatabase() {
  try {
    // Connect to MySQL server using credentials from .env [cite: 95, 96, 97]
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASS
    });

    // Create database if it does not exist [cite: 98, 111]
    await connection.query(`CREATE DATABASE IF NOT EXISTS saasdb`);

    // Switch to the saasdb database
    await connection.query(`USE saasdb`);

    // Create customers table if it does not exist [cite: 111]
    await connection.query(`
      CREATE TABLE IF NOT EXISTS customers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        fullname VARCHAR(255),
        address VARCHAR(255),
        phone VARCHAR(50),
        email VARCHAR(255)
      )
    `);

    db = connection;
    console.log("Database and table ready.");
  } catch (error) {
    console.error("Database initialization error:", error);
  }
}

// ======================= HOME PAGE ROUTE =======================
// This route retrieves all customers and renders the index.ejs page [cite: 112]
app.get("/", async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM customers");
    res.render("index", { customers: rows });
  } catch (error) {
    res.status(500).send("Error loading customers");
  }
});

// ======================= ADD CUSTOMER API =======================
// This function inserts a new customer into the database [cite: 113]
app.post("/add", async (req, res) => {
  try {
    const { fullname, address, phone, email } = req.body;
    await db.query(
      "INSERT INTO customers (fullname, address, phone, email) VALUES (?, ?, ?, ?)",
      [fullname, address, phone, email]
    );
    res.redirect("/");
  } catch (error) {
    res.status(500).send("Error adding customer");
  }
});

// ======================= DELETE CUSTOMER API =======================
// This function deletes a customer by id [cite: 113]
app.post("/delete/:id", async (req, res) => {
  try {
    const id = req.params.id;
    await db.query("DELETE FROM customers WHERE id = ?", [id]);
    res.redirect("/");
  } catch (error) {
    res.status(500).send("Error deleting customer");
  }
});

// ======================= SEND SMS API =======================
// This function sends SMS messages to selected customers using Twilio [cite: 114, 115]
app.post("/send-sms", async (req, res) => {
  try {
    const { phones, message } = req.body;
    // Loop through each selected phone number to send SMS [cite: 114]
    for (let phone of phones) {
      if (!phone) continue;
      await twilioClient.messages.create({
        body: message,
        from: process.env.TWILIO_PHONE,
        to: phone
      });
    }
    res.json({ message: "SMS sent to all selected customers." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "SMS sending failed" });
  }
});

// ======================= SEND EMAIL API =======================
// This function sends emails to selected customers using SendGrid [cite: 116, 117]
app.post("/send-email", async (req, res) => {
  try {
    const { emails, message } = req.body;
    // Loop through each selected email to send message [cite: 117]
    for (let email of emails) {
      if (!email) continue;
      const msg = {
        to: email,
        from: process.env.SENDER_EMAIL,
        subject: "Cloud Contact SaaS Notification",
        text: message
      };
      await sgMail.send(msg);
    }
    res.json({ message: "Emails sent to all selected customers." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Email sending failed" });
  }
});

// ======================= START SERVER =======================
// This function starts the Express server after initializing the database 
async function startServer() {
  await initDatabase();
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

// Run the server 
startServer();