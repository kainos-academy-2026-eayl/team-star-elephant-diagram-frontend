export const loginResponse = () =>
	new Response(JSON.stringify({ accessToken: "access-one", expiresIn: 900 }), {
		headers: {
			"Set-Cookie":
				"refreshToken=refresh-one; Max-Age=604800; Path=/; HttpOnly; Secure; SameSite=Strict",
		},
	});
