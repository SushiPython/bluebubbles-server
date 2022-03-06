import * as fs from "fs";

import { nativeImage } from "electron";
import { basename } from "path";

import { Server } from "@server";
import { Message } from "@server/databases/imessage/entity/Message";
import { FileSystem } from "@server/fileSystem";
import { Metadata } from "@server/fileSystem/types";
import { isNotEmpty } from "@server/helpers/utils";
import { Attachment } from "../entity/Attachment";
import { handledImageMimes } from "./constants";

export const getCacheName = (message: Message) => {
    const delivered = message.dateDelivered ? message.dateDelivered.getTime() : 0;
    const read = message.dateRead ? message.dateRead.getTime() : 0;
    return `${message.guid}:${delivered}:${read}`;
};

export const convertAudio = async (attachment: Attachment): Promise<string> => {
    const newPath = `${FileSystem.convertDir}/${attachment.guid}.mp3`;
    const theAttachment = attachment;
    let failed = false;
    let ext = null;

    if (attachment.uti === 'com.apple.coreaudio-format') {
        ext = 'caf'
    }

    if (!fs.existsSync(newPath)) {
        try {
            Server().log(`Converting attachment, ${theAttachment.transferName}, to an MP3...`);
            if (ext === 'caf') {
                await FileSystem.convertCafToMp3(theAttachment, newPath);
            }
        } catch (ex: any) {
            failed = true;
            Server().log(`Failed to convert CAF to MP3 for attachment, ${theAttachment.transferName}`, "debug");
            Server().log(ex?.message ?? ex, "error");
        }
    }

    if (!failed && ext) {
        // If conversion is successful, we need to modify the attachment a bit
        theAttachment.mimeType = "audio/mp3";
        theAttachment.filePath = newPath;
        theAttachment.transferName = basename(newPath).replace(`.${ext}`, ".mp3");

        // Set the fPath to the newly converted path
        return newPath;
    }

    return null;
};

export const convertImage = async (attachment: Attachment): Promise<string> => {
    const newPath = `${FileSystem.convertDir}/${attachment.guid}.jpg`;
    const theAttachment = attachment;
    let failed = false;
    let ext = null;

    if (isNotEmpty(attachment?.mimeType)) {
        if (attachment.mimeType.startsWith("image/heic")) {
            ext = "heic";
        }
    }

    if (!fs.existsSync(newPath)) {
        try {
            Server().log(`Converting image attachment, ${theAttachment.transferName}, to an JPG...`);
            if (ext === 'heic') {
                await FileSystem.convertToJpg(ext, theAttachment, newPath);
            }
        } catch (ex: any) {
            failed = true;
            Server().log(`Failed to convert image to JPG for attachment, ${theAttachment.transferName}`, "debug");
            Server().log(ex?.message ?? ex, "error");
        }
    }

    if (!failed && ext) {
        // If conversion is successful, we need to modify the attachment a bit
        theAttachment.mimeType = "image/jpg";
        theAttachment.filePath = newPath;
        theAttachment.transferName = basename(newPath).replace(`.${ext}`, ".jpg");

        // Set the fPath to the newly converted path
        return newPath;
    }

    Server().log(`Conversion returned null`);
    return null;
};

export const convertVideo = async (attachment: Attachment): Promise<string> => {
    const newPath = `${FileSystem.convertDir}/${attachment.guid}.mp4`;
    const theAttachment = attachment;
    let failed = false;
    let ext = null;

    if (isNotEmpty(attachment?.mimeType)) {
        if (attachment.uti === "com.apple.quicktime-movie" || attachment.mimeType.startsWith("video/quicktime")) {
            ext = "mov";
        }
    }

    if (!fs.existsSync(newPath)) {
        try {
            Server().log(`Converting video attachment, ${theAttachment.transferName}, to an MP4...`);
            if (ext === 'mov') {
                await FileSystem.convertToMp4(theAttachment, newPath);
            }
        } catch (ex: any) {
            failed = true;
            Server().log(`Failed to convert video to MP4 for attachment, ${theAttachment.transferName}`, "debug");
            Server().log(ex?.message ?? ex, "error");
        }
    }

    if (!failed && ext) {
        // If conversion is successful, we need to modify the attachment a bit
        theAttachment.mimeType = "video/mp4";
        theAttachment.filePath = newPath;
        theAttachment.transferName = basename(newPath).replace(`.${ext}`, ".mp4");

        // Set the fPath to the newly converted path
        return newPath;
    }

    Server().log(`Conversion returned null`);
    return null;
};

export const getAttachmentMetadata = async (attachment: Attachment): Promise<Metadata> => {
    let metadata: Metadata;
    if (attachment.uti !== "com.apple.coreaudio-format" && !attachment.mimeType) return metadata;

    if (attachment.uti === "com.apple.coreaudio-format" || attachment.mimeType.startsWith("audio")) {
        metadata = await FileSystem.getAudioMetadata(attachment.filePath);
    } else if (attachment.mimeType.startsWith("image")) {
        metadata = await FileSystem.getImageMetadata(attachment.filePath);

        try {
            // If we got no height/width data, let's try to fallback to other code to fetch it
            if (handledImageMimes.includes(attachment.mimeType) && (!metadata?.height || !metadata?.width)) {
                Server().log("Image metadata empty, getting size from NativeImage...", "debug");

                // Load the image data
                const image = nativeImage.createFromPath(FileSystem.getRealPath(attachment.filePath));

                // If we were able to load the image, get the size
                if (image) {
                    const size = image.getSize();

                    // If the size if available, set the metadata for it
                    if (size?.height && size?.width) {
                        // If the metadata is null, let's give it some data
                        if (metadata === null) metadata = {};
                        metadata.height = size.height;
                        metadata.width = size.width;
                    }
                }
            }
        } catch (ex: any) {
            Server().log("Failed to load size data from NativeImage!", "debug");
        }
    } else if (attachment.mimeType.startsWith("video")) {
        metadata = await FileSystem.getVideoMetadata(attachment.filePath);
    }

    return metadata;
};
