import express from "express";
import cors from "cors";
import { apiRouter } from "./router";
import { errorMiddleware } from "./lib/response";

const app = express();
const PORT = Number(process.env.PORT ?? 6174);

app.use(cors());
app.use(express.json());

app.use("/api", apiRouter);
app.use(errorMiddleware);

app.listen(PORT, () => {
  console.log(`[api] 学旅后端启动：http://localhost:${PORT}`);
});
