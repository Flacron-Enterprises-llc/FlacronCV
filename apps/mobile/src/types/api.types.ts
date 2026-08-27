export interface ApiResponse<T> {
  data: T;
  message?: string;
  statusCode: number;
}

/** CV and cover-letter list handlers (`GET /cvs`, `GET /cover-letters`). */
export interface ListPage<T> {
  items: T[];
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface AIResponse {
  content: string;
  provider: string;
  creditsUsed: number;
}

export interface ExportRequest {
  format: 'pdf' | 'docx';
  options?: {
    includePhoto?: boolean;
    pageSize?: string;
  };
}

export interface ExportResponse {
  url: string;
  expiresAt: string;
  filename: string;
}
