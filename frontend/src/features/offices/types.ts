export type Office = {
  id: string;
  title: string;
  address: string;
  areaSqm: number;
  monthlyPrice: number;
  status: "AVAILABLE" | "RESERVED" | "LEASED" | "INACTIVE";
  buildingId?: string;
  buildingName?: string;
  floor?: number;
  roomNumber?: string;
  position?: number;
  description?: string;
  imageUrl?: string;
  externalImageUrl?: string;
  imageKey?: string;
  processedImageKey?: string;
  processedImageReady?: boolean;
  amenities?: string[];
  createdAt?: string;
  updatedAt?: string;
};

export type OfficeSearchParams = {
  q?: string;
  status?: Office["status"];
  nextToken?: string;
  limit?: number;
};
