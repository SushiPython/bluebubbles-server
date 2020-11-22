import { Server } from "@server/index";

import * as net from "net";

export class BlueBubblesHelperService {
    server: net.Server;

    helper: net.Socket;

    typingCache: string[];

    constructor() {
        this.server = net.createServer((socket: net.Socket) => {
            this.helper = socket;
            this.helper.setDefaultEncoding("utf8");
            this.setupListeners();
            Server().log("Helper connected!");

            this.helper.on("close", () => {
                Server().log("Helper disconnected!", "error");
                this.helper = null;
            });
        });
    }

    start() {
        this.server.listen(45677, "localhost");
    }

    startTyping(chatGuid: string) {
        if (!this.helper || !this.server) {
            Server().log("Failed to start typing, BlueBubblesHelper is not running!", "error");
            return;
        }
        if (!chatGuid) {
            Server().log("Failed to start typing, no chatGuid specified!", "error");
            return;
        }

        const data = {
            event: "start-typing",
            data: chatGuid
        };
        if (!this.helper.write(`${JSON.stringify(data)  }\n`)) {
            Server().log("Failed to start typing, an error occured writing to the socket", "error");
        }
    }

    stopTyping(chatGuid: string) {
        if (!this.helper || !this.server) {
            Server().log("Failed to stop typing, BlueBubblesHelper is not running!", "error");
            return;
        }
        if (!chatGuid) {
            Server().log("Failed to stop typing, no chatGuid specified!", "error");
            return;
        }

        const data = {
            event: "stop-typing",
            data: chatGuid
        };
        if (!this.helper.write(`${JSON.stringify(data)  }\n`)) {
            Server().log("Failed to stop typing, an error occured writing to the socket", "error");
        }
    }

    setupListeners() {
        this.helper.on("data", (event: string) => {
            const data = JSON.parse(event);
            if (data.event === "started-typing") {
                Server().emitMessage("typing-indicator", { display: true, guid: data.guid });
                Server().log(`Started typing! ${data}`);
            } else if (data.event === "stopped-typing") {
                Server().emitMessage("typing-indicator", { display: false, guid: data.guid });
                Server().log(`Stopped typing! ${data}`);
            }
            Server().log(`Helper gave new data! ${event}`);
        });
    }
}
