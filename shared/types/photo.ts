/** Status of a trip photo in the processing pipeline */
export type PhotoStatus = "processing" | "ready" | "failed";

/** A photo uploaded to a trip */
export interface Photo {
  id: string;
  tripId: string;
  uploadedBy: string;
  url: string | null;
  caption: string | null;
  status: PhotoStatus;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface GetPhotosResponse {
  success: true;
  photos: Photo[];
}

export interface UploadPhotosResponse {
  success: true;
  photos: Photo[];
}

export interface UpdatePhotoResponse {
  success: true;
  photo: Photo;
}
