require("dotenv").config();
const express = require("express");
const mysql = require("mysql2/promise");
const twilio = require("twilio");
const sgMail = require("@sendgrid/mail");
const path = require("path");

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Config API Keys
sgMail.setApiKey(process.env.SENDGRID_API_KEY);
const twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);

let db;

// ======================= DATABASE INITIALIZATION =======================
async function initDatabase() {
  try {
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASS
    });

    await connection.query(`CREATE DATABASE IF NOT EXISTS saasdb`);
    await connection.query(`USE saasdb`);

    // 1. Bảng Khách hàng
    await connection.query(`
      CREATE TABLE IF NOT EXISTS customers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        fullname VARCHAR(255),
        address VARCHAR(255),
        phone VARCHAR(50),
        email VARCHAR(255)
      )
    `);

    // 2. Bảng Người dùng (Đăng nhập) - Phục vụ chức năng Login sau này
    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(20) DEFAULT 'staff'
      )
    `);

    // 3. Bảng Lịch sử gửi tin (Logs)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS communication_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        customer_id INT,
        user_id INT,
        type ENUM('sms', 'email') NOT NULL,
        recipient_value VARCHAR(255),
        content TEXT,
        status VARCHAR(50),
        sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
      )
    `);

    db = connection;
    console.log("Database and All Tables Ready.");
  } catch (error) {
    console.error("Database initialization error:", error);
  }
}

// ======================= ROUTES =======================

// Xem danh sách khách hàng
app.get("/", async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM customers ORDER BY id DESC");
    res.render("index", { customers: rows });
  } catch (error) {
    res.status(500).send("Error loading customers");
  }
});

// Thêm khách hàng
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

// Xóa khách hàng
app.post("/delete/:id", async (req, res) => {
  try {
    await db.query("DELETE FROM customers WHERE id = ?", [req.params.id]);
    res.redirect("/");
  } catch (error) {
    res.status(500).send("Error deleting customer");
  }
});

// Gửi SMS & Lưu Log
app.post("/send-sms", async (req, res) => {
  try {
    const { phones, message } = req.body;
    for (let phone of phones) {
      if (!phone) continue;
      
      // Gửi qua Twilio
      await twilioClient.messages.create({
        body: message,
        from: process.env.TWILIO_PHONE,
        to: phone
      });

      // Ghi Log vào DB
      await db.query(
        "INSERT INTO communication_logs (type, recipient, content, status) VALUES ('sms', ?, ?, 'success')",
        [phone, message]
      );
    }
    res.json({ message: "SMS sent and logged successfully." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "SMS failed" });
  }
});

// Gửi Email & Lưu Log
app.post("/send-email", async (req, res) => {
  try {
    const { emails, message } = req.body;
    for (let email of emails) {
      if (!email) continue;
      
      const msg = {
        to: email,
        from: process.env.SENDER_EMAIL,
        subject: "Cloud Contact SaaS Notification",
        text: message
      };

      await sgMail.send(msg);

      // Ghi Log vào DB
      await db.query(
        "INSERT INTO communication_logs (type, recipient, content, status) VALUES ('email', ?, ?, 'success')",
        [email, message]
      );
    }
    res.json({ message: "Emails sent and logged successfully." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Email failed" });
  }
});

async function startServer() {
  await initDatabase();
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

startServer();