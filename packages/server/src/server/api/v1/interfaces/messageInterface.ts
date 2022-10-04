import { Server } from "@server";
import { FileSystem } from "@server/fileSystem";
import { MessagePromise } from "@server/managers/outgoingMessageManager/messagePromise";
import { Message } from "@server/databases/imessage/entity/Message";
import { checkPrivateApiStatus, isNotEmpty, waitMs } from "@server/helpers/utils";
import { negativeReactionTextMap, reactionTextMap } from "@server/api/v1/apple/mappings";
import { invisibleMediaChar } from "@server/services/httpService/constants";
import { ActionHandler } from "@server/api/v1/apple/actions";
import type {
    SendMessageParams,
    SendAttachmentParams,
    SendMessagePrivateApiParams,
    SendReactionParams,
    UnsendMessageParams,
    EditMessageParams
} from "@server/api/v1/types";

export class MessageInterface {
    static possibleReactions: string[] = [
        "love",
        "like",
        "dislike",
        "laugh",
        "emphasize",
        "question",
        "-love",
        "-like",
        "-dislike",
        "-laugh",
        "-emphasize",
        "-question"
    ];

    /**
     * Sends a message by executing the sendMessage AppleScript
     *
     * @param chatGuid The GUID for the chat
     * @param message The message to send
     * @param attachmentName The name of the attachment to send (optional)
     * @param attachment The bytes (buffer) for the attachment
     *
     * @returns The command line response
     */
    static async sendMessageSync({
        chatGuid,
        message,
        method = "apple-script",
        attributedBody = null,
        subject = null,
        effectId = null,
        selectedMessageGuid = null,
        tempGuid = null,
        partIndex = 0
    }: SendMessageParams): Promise<Message> {
        if (!chatGuid) throw new Error("No chat GUID provided");

        Server().log(`Sending message "${message}" to ${chatGuid}`, "debug");

        // We need offsets here due to iMessage's save times being a bit off for some reason
        const now = new Date(new Date().getTime() - 10000).getTime(); // With 10 second offset
        const awaiter = new MessagePromise({
            chatGuid,
            text: message,
            isAttachment: false,
            sentAt: now,
            subject,
            tempGuid
        });

        // Add the promise to the manager
        Server().log(`Adding await for chat: "${chatGuid}"; text: ${awaiter.text}; tempGuid: ${tempGuid ?? "N/A"}`);
        Server().messageManager.add(awaiter);

        // Try to send the iMessage
        let sentMessage = null;
        if (method === "apple-script") {
            // Attempt to send the message
            await ActionHandler.sendMessageHandler(chatGuid, message ?? "", null);
            sentMessage = await awaiter.promise;
        } else if (method === "private-api") {
            sentMessage = await MessageInterface.sendMessagePrivateApi({
                chatGuid,
                message,
                attributedBody,
                subject,
                effectId,
                selectedMessageGuid,
                partIndex
            });
        } else {
            throw new Error(`Invalid send method: ${method}`);
        }

        return sentMessage;
    }

    /**
     * Sends a message by executing the sendMessage AppleScript
     *
     * @param chatGuid The GUID for the chat
     * @param message The message to send
     * @param attachmentName The name of the attachment to send (optional)
     * @param attachment The bytes (buffer) for the attachment
     *
     * @returns The command line response
     */
    static async sendAttachmentSync({
        chatGuid,
        attachmentPath,
        attachmentName = null,
        attachmentGuid = null
    }: SendAttachmentParams): Promise<Message> {
        if (!chatGuid) throw new Error("No chat GUID provided");

        // Copy the attachment to a more permanent storage
        const newPath = FileSystem.copyAttachment(attachmentPath, attachmentName);

        Server().log(`Sending attachment "${attachmentName}" to ${chatGuid}`, "debug");

        // Make sure messages is open
        await FileSystem.startMessages();

        // Since we convert mp3s to cafs we need to correct the name for the awaiter
        let aName = attachmentName;
        if (aName !== null && aName.endsWith(".mp3")) {
            aName = `${aName.substring(0, aName.length - 4)}.caf`;
        }

        // We need offsets here due to iMessage's save times being a bit off for some reason
        const now = new Date(new Date().getTime() - 10000).getTime(); // With 10 second offset
        const awaiter = new MessagePromise({
            chatGuid: chatGuid,
            text: aName,
            isAttachment: true,
            sentAt: now,
            tempGuid: attachmentGuid
        });

        // Add the promise to the manager
        Server().log(
            `Adding await for chat: "${chatGuid}"; attachment: ${aName}; tempGuid: ${attachmentGuid ?? "N/A"}`
        );
        Server().messageManager.add(awaiter);

        // Send the message
        await ActionHandler.sendMessageHandler(chatGuid, "", newPath);
        return await awaiter.promise;
    }

    static async sendMessagePrivateApi({
        chatGuid,
        message,
        attributedBody = null,
        subject = null,
        effectId = null,
        selectedMessageGuid = null,
        partIndex = 0
    }: SendMessagePrivateApiParams) {
        checkPrivateApiStatus();
        const result = await Server().privateApiHelper.sendMessage(
            chatGuid,
            message,
            attributedBody ?? null,
            subject ?? null,
            effectId ?? null,
            selectedMessageGuid ?? null,
            partIndex ?? 0
        );

        if (!result?.identifier) {
            throw new Error("Failed to send message!");
        }

        // Fetch the chat based on the return data
        let retMessage = await Server().iMessageRepo.getMessage(result.identifier, true, false);
        let tryCount = 0;
        while (!retMessage) {
            tryCount += 1;

            // If we've tried 10 times and there is no change, break out (~10 seconds)
            if (tryCount >= 40) break;

            // Give it a bit to execute
            await waitMs(250);

            // Re-fetch the message with the updated information
            retMessage = await Server().iMessageRepo.getMessage(result.identifier, true, false);
        }

        // Check if the name changed
        if (!retMessage) {
            throw new Error("Failed to send message! Message not found after 5 seconds!");
        }

        return retMessage;
    }

    static async unsendMessage({ chatGuid, messageGuid, partIndex = 0 }: UnsendMessageParams) {
        checkPrivateApiStatus();
        await Server().privateApiHelper.unsendMessage({ chatGuid, messageGuid, partIndex: partIndex ?? 0 });

        // Fetch the chat based on the return data
        let retMessage = await Server().iMessageRepo.getMessage(messageGuid, true, false);
        let tryCount = 0;
        while (!retMessage) {
            tryCount += 1;

            // If we've tried 10 times and there is no change, break out (~10 seconds)
            if (tryCount >= 40) break;

            // Give it a bit to execute
            await waitMs(250);

            // Re-fetch the message with the updated information
            retMessage = await Server().iMessageRepo.getMessage(messageGuid, true, false);
        }

        // Check if the name changed
        if (!retMessage) {
            throw new Error("Failed to unsend message! Message not found after 5 seconds!");
        }

        return retMessage;
    }

    static async editMessage({
        chatGuid,
        messageGuid,
        editedMessage,
        backwardsCompatMessage,
        partIndex = 0
    }: EditMessageParams) {
        checkPrivateApiStatus();
        await Server().privateApiHelper.editMessage({
            chatGuid,
            messageGuid,
            editedMessage,
            backwardsCompatMessage,
            partIndex: partIndex ?? 0
        });

        // Fetch the chat based on the return data
        let retMessage = await Server().iMessageRepo.getMessage(messageGuid, true, false);
        let tryCount = 0;
        while (!retMessage) {
            tryCount += 1;

            // If we've tried 10 times and there is no change, break out (~10 seconds)
            if (tryCount >= 40) break;

            // Give it a bit to execute
            await waitMs(250);

            // Re-fetch the message with the updated information
            retMessage = await Server().iMessageRepo.getMessage(messageGuid, true, false);
        }

        // Check if the name changed
        if (!retMessage) {
            throw new Error("Failed to edit message! Message not found after 5 seconds!");
        }

        return retMessage;
    }

    static async sendReaction({
        chatGuid,
        message,
        reaction,
        tempGuid = null,
        partIndex = 0
    }: SendReactionParams): Promise<Message> {
        checkPrivateApiStatus();

        // Rebuild the selected message text to make it what the reaction text
        // would be in the database
        const prefix = (reaction as string).startsWith("-")
            ? negativeReactionTextMap[reaction as string]
            : reactionTextMap[reaction as string];

        // If the message text is just the invisible char, we know it's probably just an attachment
        const text = message.universalText(false) ?? "";
        const isOnlyMedia = text.length === 1 && text === invisibleMediaChar;

        // Default the message to the other message surrounded by greek quotes
        let msg = `“${text}”`;

        // If it's a media-only message and we have at least 1 attachment,
        // set the message according to the first attachment's MIME type
        if (isOnlyMedia && isNotEmpty(message.attachments)) {
            if (message.attachments[0].mimeType.startsWith("image")) {
                msg = `an image`;
            } else if (message.attachments[0].mimeType.startsWith("video")) {
                msg = `a movie`;
            } else {
                msg = `an attachment`;
            }
        }

        // Build the final message to match on
        const messageText = `${prefix} ${msg}`;

        // We need offsets here due to iMessage's save times being a bit off for some reason
        const now = new Date(new Date().getTime() - 10000).getTime(); // With 10 second offset
        const awaiter = new MessagePromise({ chatGuid, text: messageText, isAttachment: false, sentAt: now, tempGuid });
        Server().messageManager.add(awaiter);

        // Send the reaction
        const result = await Server().privateApiHelper.sendReaction(chatGuid, message.guid, reaction, partIndex ?? 0);
        if (!result?.identifier) {
            throw new Error("Failed to send reaction! No message GUID returned.");
        } else {
            Server().log(`Reaction sent with Message GUID: ${result.identifier}`, "debug");
        }

        // Fetch the chat based on the return data
        let retMessage = await Server().iMessageRepo.getMessage(result.identifier, true, false);
        let tryCount = 0;
        while (!retMessage) {
            tryCount += 1;

            // If we've tried 10 times and there is no change, break out (~10 seconds)
            if (tryCount >= 20) break;

            // Give it a bit to execute
            await waitMs(500);

            // Re-fetch the message with the updated information
            retMessage = await Server().iMessageRepo.getMessage(result.identifier, true, false);
        }

        // If we can't get the message via the transaction, try via the promise
        if (!retMessage) {
            retMessage = await awaiter.promise;
        }

        // Check if the name changed
        if (!retMessage) {
            throw new Error("Failed to send reaction! Message not found after 5 seconds!");
        }

        // Return the message
        return retMessage;
    }
}
