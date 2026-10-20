// Temporary deployment diagnostic. Prints DNS and TCP reachability for the
// database host before Medusa starts. Remove once the connection is verified.
const dns = require("node:dns").promises
const net = require("node:net")

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

  try {
    const addresses = await dns.lookup(host, { all: true })
    console.log(`[preflight] dns=${addresses.map((a) => a.address).join(",")}`)
  } catch (error) {
    console.log(`[preflight] dns-failed code=${error.code} message=${error.message}`)
    return
  }

  await new Promise((resolve) => {
    const socket = net.connect({ host, port })
    const done = (message) => {
      console.log(`[preflight] tcp=${message}`)
      socket.destroy()
      resolve()
    }
    socket.setTimeout(5000)
    socket.once("connect", () => done("connected"))
    socket.once("timeout", () => done("timeout"))
    socket.once("error", (error) => done(`error code=${error.code}`))
  })
}

main().catch((error) => console.log(`[preflight] failed=${error.message}`))
