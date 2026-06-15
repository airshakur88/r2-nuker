export interface R2Object {
  key: string;
  size?: number;
  lastModified?: Date;
  storageClass?: string;
  etag?: string;
}

export interface R2ObjectDetail {
  key: string;
  size: number;
  lastModified: Date;
  storageClass: string;
  etag: string;
  contentType: string;
  metadata: Record<string, string>;
}

export interface MultipartUpload {
  key: string;
  uploadId: string;
  initiated?: Date;
}

export interface BucketInfo {
  name: string;
  creationDate?: string;
  location?: string;
  storageClass?: string;
  jurisdiction?: string;
}

export interface LifecycleRule {
  id: string;
  prefix: string;
  enabled: boolean;
  abortMultipartUploadsDays?: number;
  expirationDays?: number;
  expirationDate?: string;
  transitionDays?: number;
  transitionStorageClass?: string;
}

export interface CorsRule {
  id?: string;
  allowedMethods: string[];
  allowedOrigins: string[];
  allowedHeaders?: string[];
  exposeHeaders?: string[];
  maxAgeSeconds?: number;
}

export interface CustomDomain {
  domain: string;
  enabled: boolean;
  zoneId?: string;
  zoneName?: string;
  status: {
    ownership: string;
    ssl: string;
  };
}

export interface BucketToken {
  id: string;
  accessKeyId: string;
  secretAccessKey: string;
  status: string;
}

export interface PresignedUrlResult {
  url: string;
  expiresInSeconds: number;
  operation: string;
  key: string;
  bucket: string;
}

export interface NukeResult {
  bucket: string;
  deletedObjects: number;
  bypassedObjects: number;
  abortedUploads: number;
  deletedUploads: number;
  errors: string[];
}
