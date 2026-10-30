import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const directory = new URL("../.certs/", import.meta.url);
const cert = fileURLToPath(new URL("localhost.pem", directory));
const key = fileURLToPath(new URL("localhost-key.pem", directory));

if (existsSync(cert) || existsSync(key)) {
	throw new Error(
		"Local certificate files already exist. Reuse them, or explicitly remove both files before generating a replacement.",
	);
}

mkdirSync(directory, { recursive: true, mode: 0o700 });
const previousMask = process.umask(0o077);
try {
	execFileSync(
		"openssl",
		[
			"req",
			"-x509",
			"-newkey",
			"rsa:2048",
			"-nodes",
			"-keyout",
			key,
			"-out",
			cert,
			"-days",
			"365",
			"-subj",
			"/CN=localhost",
			"-addext",
			"subjectAltName=DNS:localhost,IP:127.0.0.1,IP:::1",
			"-addext",
			"basicConstraints=critical,CA:FALSE",
			"-addext",
			"extendedKeyUsage=serverAuth",
		],
		{ stdio: "inherit" },
	);
	chmodSync(key, 0o600);
} finally {
	process.umask(previousMask);
}
console.log("Created a self-signed localhost certificate in .certs/.");
console.log(
	"Set TLS_CERT_FILE=.certs/localhost.pem and TLS_KEY_FILE=.certs/localhost-key.pem in .env.",
);
console.log(
	"The certificate is for local development only and is not automatically trusted by your browser.",
);
