// Temporary deployment diagnostic. Prints DNS, TCP, and PostgreSQL handshake
// details before Medusa starts. Remove once the connection is verified.
const dns = require("node:dns").promises
const net = require("node:net")

async function probeTcp(host, port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port })
    const done = (message) => {
      socket.destroy()
      resolve(message)
    }
    socket.setTimeout(5000)
    socket.once("connect", () => done("connected"))
    socket.once("timeout", () => done("timeout"))
    socket.once("error", (error) => done(`error code=${error.code}`))
  })
}

async function probePostgres(raw) {
  const { Client } = require("pg")
  const client = new Client({
    connectionString: raw,
    connectionTimeoutMillis: 8000,
    query_timeout: 8000,
  })
  try {
    await client.connect()
    const result = await client.query(
      "select current_database() as db, current_user as usr, version() as v"
    )
    const row = result.rows[0]
    console.log(`[preflight] pg=connected db=${row.db} user=${row.usr}`)
    console.log(`[preflight] postgres=${row.v.split(" ").slice(0, 2).join(" ")}`)
  } catch (error) {
    console.log(`[preflight] pg-error code=${error.code} message=${error.message}`)
  } finally {
    await client.end().catch(() => {})
  }
}

async function probeMedusaKnex(raw) {
  try {
    const { createPgConnection } = require("@medusajs/utils/dist/modules-sdk/create-pg-connection.js")
    const db = createPgConnection({
      clientUrl: raw,
      pool: { min: 0, max: 1, propagateCreateError: true },
    })
    const started = Date.now()
    try {
      const result = await Promise.race([
        db.raw("select 1 as ok"),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), 12000)
        ),
      ])
      console.log(`[preflight] medusa-knex=ok ${Date.now() - started}ms rows=${JSON.stringify(result.rows)}`)
    } finally {
      await db.destroy().catch(() => {})
    }
  } catch (error) {
    console.log(`[preflight] medusa-knex-error code=${error.code} message=${error.message}`)
  }
}

async function main() {
  const raw = process.env.DATABASE_URL
  if (!raw) {
    console.log("[preflight] DATABASE_URL is not set")
    return
  }

  const url = new URL(raw)
  const host = url.hostname
  const port = Number(url.port || 5432)
  console.log(`[preflight] host=${host} port=${port} user=${url.username}`)
  console.log(`[preflight] params=${url.search || "none"}`)

  try {
    const addresses = await dns.lookup(host, { all: true })
    console.log(`[preflight] dns=${addresses.map((a) => a.address).join(",")}`)
  } catch (error) {
    console.log(`[preflight] dns-failed code=${error.code} message=${error.message}`)
    return
  }

  console.log(`[preflight] tcp=${await probeTcp(host, port)}`)
  await probePostgres(raw)
  await probeMedusaKnex(raw)
}

main().catch((error) => console.log(`[preflight] failed=${error.message}`))
