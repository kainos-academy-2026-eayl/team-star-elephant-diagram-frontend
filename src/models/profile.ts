 export interface ProfileUser {
	firstName: string;
	lastName: string;
	email: string;
	phone?: string;
	address?: {
		line1: string;
		line2?: string;
		city: string;
		postcode: string;
	};
	memberSince: string;
}

export interface ProfileOrderItem {
	productName: string;
	quantity: number;
	displayUnitPrice: string;
	displaySubtotal: string;
}

export interface ProfileOrder {
	id?: string | number;
	orderNumber?: string | number;
	placedAt: string;
	status: string;
	items: ProfileOrderItem[];
	displayTotal: string;
}

export interface ProfileData {
	user: ProfileUser;
	orders: ProfileOrder[];
}
