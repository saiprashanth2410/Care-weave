import mongoose from 'mongoose'
import { connectDB } from './db.js'

try {
  const conn = await connectDB()
  await conn.db!.admin().ping()
  console.log(`Connected to MongoDB, database "${conn.name}", host ${conn.host}`)
} catch (err) {
  // Print the reason only, never the connection string.
  console.error('MongoDB connection failed:', (err as Error).message.replace(/mongodb(\+srv)?:\/\/\S+/g, '[uri]'))
  process.exitCode = 1
} finally {
  await mongoose.disconnect()
}
