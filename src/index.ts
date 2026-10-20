import "dotenv/config";
import { createApp } from "./app";

if (!process.env.PORT) {
	throw new Error("PORT environment variable is not set");
}

const HOST = "0.0.0.0";
const PORT = Number(process.env.PORT);

if (!Number.isInteger(PORT) || PORT < 0 || PORT > 65535) {
	throw new Error(`Invalid PORT: ${process.env.PORT}`);
}

const app = createApp();

app.listen(3000, () => {
	console.log("Server running on http://localhost:3000");
});

// Register new controllers / middleware here!

// app.use('/', ...)

// Keep everything below this comment at the bottom of the file
const server = app.listen(PORT, HOST, () => {
	console.log(`Listening on http://${HOST}:${PORT}`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
	process.on(signal, () => {
		server.close(() => process.exit(0));
	});
}
