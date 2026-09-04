import { create } from "@bufbuild/protobuf";
import { attachmentServiceClient } from "@/connect";
import { registerUploadProgress, UPLOAD_PROGRESS_HEADER } from "@/lib/upload-progress";
import type { Attachment } from "@/types/proto/api/v1/attachment_service_pb";
import { AttachmentSchema, MotionMediaSchema } from "@/types/proto/api/v1/attachment_service_pb";
import type { LocalFile } from "../types/attachment";

/**
 * `uploading` while bytes are still going out; `processing` once the request body
 * has been sent and the server is storing it. The two are worth telling apart: a
 * large image can sit in `processing` for seconds while EXIF is stripped, and a bar
 * frozen at 100% with no explanation reads as a hang.
 */
export type UploadPhase = "uploading" | "processing";

export interface UploadProgress {
  phase: UploadPhase;
  /** Bytes sent for the file in flight. */
  loaded: number;
  /** Total bytes for the file in flight. */
  total: number;
  /** 1-based position of the file in flight. */
  index: number;
  /** Number of files in this batch. */
  count: number;
  filename: string;
}

export type UploadProgressHandler = (progress: UploadProgress) => void;

/** Fraction of the whole batch that has been sent, 0-1. Assumes equal-ish files only for the tail. */
export const uploadProgressRatio = (progress: UploadProgress): number => {
  const completed = progress.index - 1;
  const current = progress.total > 0 ? progress.loaded / progress.total : 0;
  return Math.min(1, (completed + current) / Math.max(1, progress.count));
};

export const uploadService = {
  async uploadFile(localFile: LocalFile, onProgress?: (loaded: number, total: number) => void): Promise<Attachment> {
    const { file, motionMedia } = localFile;
    const [mediaMetadata, arrayBuffer] = await Promise.all([localFile.mediaMetadata, file.arrayBuffer()]);
    const buffer = new Uint8Array(arrayBuffer);
    const attachment = create(AttachmentSchema, {
      filename: file.name,
      size: BigInt(file.size),
      type: file.type,
      content: buffer,
      motionMedia: motionMedia ? create(MotionMediaSchema, motionMedia) : undefined,
      mediaMetadata,
    });

    if (!onProgress) {
      return attachmentServiceClient.createAttachment({ attachment });
    }

    const { id, dispose } = registerUploadProgress(onProgress);
    try {
      return await attachmentServiceClient.createAttachment({ attachment }, { headers: { [UPLOAD_PROGRESS_HEADER]: id } });
    } finally {
      dispose();
    }
  },

  async uploadFiles(localFiles: LocalFile[], onProgress?: UploadProgressHandler): Promise<Attachment[]> {
    if (localFiles.length === 0) return [];

    const attachments: Attachment[] = [];

    for (const [offset, localFile] of localFiles.entries()) {
      const index = offset + 1;
      const count = localFiles.length;
      const filename = localFile.file.name;

      if (!onProgress) {
        attachments.push(await uploadService.uploadFile(localFile));
        continue;
      }

      // Report the file as pending before its first progress event so the gauge
      // names the right file from the moment the upload starts.
      onProgress({ phase: "uploading", loaded: 0, total: localFile.file.size, index, count, filename });
      attachments.push(
        await uploadService.uploadFile(localFile, (loaded, total) => {
          const phase: UploadPhase = loaded >= total ? "processing" : "uploading";
          onProgress({ phase, loaded, total, index, count, filename });
        }),
      );
    }

    return attachments;
  },
};
