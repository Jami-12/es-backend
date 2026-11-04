export interface CreateAddressInput {
  fullName: string;
  phone: string;
  division?: string;
  district: string;
  area?: string;
  addressLine: string;
  postalCode?: string;
  isDefault?: boolean;
}

export type UpdateAddressInput = Partial<CreateAddressInput>;

export interface AddressResponse {
  id: string;
  userId: string;
  fullName: string;
  phone: string;
  division: string | null;
  district: string;
  area: string | null;
  addressLine: string;
  postalCode: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}
