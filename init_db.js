import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

async function createDb() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASS
    });
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME}\`;`);
    console.log(`Database ${process.env.DB_NAME} created found.`);
    await connection.end();
}

createDb().catch(err => {
    console.error("Error creating DB:", err);
});
