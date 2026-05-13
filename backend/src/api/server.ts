import express from "express";
import cors from "cors";

import prisma from "../db/prisma";

const app = express();

app.use(cors());
function bigintReplacer(
    _: string,
    value: any
) {
    return typeof value === "bigint"
        ? value.toString()
        : value;
}
app.get("/streams", async (_, res) => {
    const streams = await prisma.stream.findMany({
        orderBy: {
            createdAt: "desc",
        },
    });

    res.send(
        JSON.stringify(
            streams,
            bigintReplacer
        )
    );
});

app.get("/streams/:id", async (req, res) => {
    const stream =
        await prisma.stream.findUnique({
            where: {
                id: req.params.id,
            },
        });

    res.send(
        JSON.stringify(
            stream,
            bigintReplacer
        )
    );
});

app.listen(3000, () => {
    console.log("API running on 3000");
});