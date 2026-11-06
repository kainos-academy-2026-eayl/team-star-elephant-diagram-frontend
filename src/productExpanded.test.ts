import type { Request, Response } from "express";
import nunjucks from "nunjucks";
import { describe, expect, it, vi } from "vitest";
import { BackendApiError } from "./backendApi";
import { ProductController } from "./controllers/productController";
import type { ProductDetail } from "./models/product";
import type { ProductService } from "./services/productService";
import type { SessionService } from "./services/sessionService";
import { menuCategories } from "./siteMenu";

const product: ProductDetail = {
	productId: 42,
	name: "Green tea",
	category: "Food & Drink",
	description: "Fresh tea",
	price: 12.99,
	imageURL: "",
	images: [],
	formattedPrice: "£12.99",
	stockQuantity: 30,
	inStock: true,
	lowStock: false,
	maxOrderQuantity: 30,
};

const basket = (...quantities: number[]) => ({
	items: quantities.map((quantity, index) => ({
		productId: index + 1,
		productName: "Item",
		quantity,
		unitPrice: 1,
	})),
	subtotal: 0,
});

const setup = (getProduct: ProductService["getProduct"]) => {
	const productService = { getProduct: vi.fn(getProduct) };
	const sessions = { request: vi.fn().mockResolvedValue(basket(2, 3)) };
	const controller = new ProductController(
		productService as unknown as ProductService,
		sessions as unknown as SessionService,
	);
	const res = {
		status: vi.fn().mockReturnThis(),
		render: vi.fn(),
	};
	const get = (productId: string, query: Record<string, string> = {}) =>
		controller.getProduct(
			{
				params: { productId },
				query,
				get: () => undefined,
			} as unknown as Request<{ productId: string }>,
			res as unknown as Response,
		);
	return { productService, sessions, res, get };
};

describe("ProductController.getProduct", () => {
	it("renders the product with the basket item count", async () => {
		const { res, get } = setup(async () => product);

		await get("42", { basket: "limit" });

		expect(res.status).not.toHaveBeenCalled();
		expect(res.render).toHaveBeenCalledWith("product_expanded", {
			product,
			basketMessage: expect.objectContaining({ type: "error" }),
			cartCount: 5,
		});
	});

	it("renders a zero cart count when the basket lookup fails", async () => {
		const { sessions, res, get } = setup(async () => product);
		sessions.request.mockRejectedValue(new BackendApiError(401, "Log in"));

		await get("42");

		expect(res.render).toHaveBeenCalledWith(
			"product_expanded",
			expect.objectContaining({ product, cartCount: 0 }),
		);
	});

	it("passes the cart count to the invalid ID page without loading a product", async () => {
		const { productService, res, get } = setup(async () => product);

		await get("abc");

		expect(productService.getProduct).not.toHaveBeenCalled();
		expect(res.status).toHaveBeenCalledWith(400);
		expect(res.render).toHaveBeenCalledWith("product_expanded", {
			error: "Invalid product ID.",
			cartCount: 5,
		});
	});

	it("passes the cart count to the not-found page", async () => {
		const { res, get } = setup(async () => {
			throw new BackendApiError(404, "Not found");
		});

		await get("42");

		expect(res.status).toHaveBeenCalledWith(404);
		expect(res.render).toHaveBeenCalledWith("product_expanded", {
			cartCount: 5,
		});
	});

	it("passes the cart count to the unavailable page", async () => {
		const { res, get } = setup(async () => {
			throw new Error("Connection refused");
		});

		await get("42");

		expect(res.status).toHaveBeenCalledWith(503);
		expect(res.render).toHaveBeenCalledWith(
			"product_expanded",
			expect.objectContaining({ cartCount: 5 }),
		);
	});
});

describe("product_expanded template", () => {
	const env = new nunjucks.Environment(
		new nunjucks.FileSystemLoader("src/pages"),
		{ autoescape: true },
	).addGlobal("menuCategories", menuCategories);
	const render = (context: object) =>
		env.render("product_expanded.njk", context);

	it("uses the shared storefront header and burger menu without client-side JS", () => {
		const html = render({ product, cartCount: 0 });

		expect(html).toContain('class="site-header"');
		expect(html).toContain('command="show-modal"');
		expect(html).toContain('commandfor="site-menu"');
		expect(html).toContain('<dialog class="side-menu" id="site-menu"');
		expect(html).toContain('href="/site.css"');
		expect(html).not.toContain("<script");
		expect(html).not.toContain("cart-link__badge");
	});

	it("shows the cart count on the header icon and menu", () => {
		const html = render({ product, cartCount: 5 });

		expect(html).toMatch(/class="cart-link__badge"[^>]*>5</);
		expect(html).toContain('aria-label="Basket, 5 items"');
		expect(html).toContain('class="menu-item__badge">5<');
	});

	it("links the breadcrumb back to the product's category", () => {
		const html = render({ product });

		expect(html).toContain('href="/products?category=Food%20%26%20Drink"');
		expect(html).toContain('<li aria-current="page">Green tea</li>');
	});

	it.each([
		[{}, "Product not found"],
		[{ error: "Invalid product ID." }, "Invalid product ID."],
	])("keeps the shared header and menu on the %j state", (context, text) => {
		const html = render({ ...context, cartCount: 2 });

		expect(html).toContain(text);
		expect(html).toContain('class="site-header"');
		expect(html).toContain('id="site-menu"');
		expect(html).toMatch(/class="cart-link__badge"[^>]*>2</);
	});
});
