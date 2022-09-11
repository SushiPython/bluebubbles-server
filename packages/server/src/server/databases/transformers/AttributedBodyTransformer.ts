import { ValueTransformer } from "typeorm";
import {NSAttributedString, Unarchiver} from "node-typedstream";
import {Server} from "@server";
import { isEmpty } from "@server/helpers/utils";

export const AttributedBodyTransformer: ValueTransformer = {
    from: dbValue => {
        try {
            const attributedBody = Unarchiver.open(dbValue).decodeAll();
            if (isEmpty(attributedBody)) return null;

            const attributedBodies = attributedBody[0].values.filter((e) => {
                return e && e instanceof NSAttributedString;
            }).map((e) => {
                // Rename value to string for backwards compatibility
                if (Object.keys(e).includes("value")) {
                    e.string = e.value;
                    delete e.value;
                }

                return e;
            });

            return attributedBodies;
        } catch (e: any) {
            Server().log(`Failed to deserialize attributedBody: ${e.message}`, "debug");
        }

        return null;
    },
    to: _ => null
};
