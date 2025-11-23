This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

```bash
npm install
cp .env.local.example .env.local
npm run dev
```

| Env Var | Description | Default |
| --- | --- | --- |
| `NEXT_PUBLIC_ORCH_URL` | Base URL for orchestrator API | `http://127.0.0.1:8002` |

Visit [http://localhost:3000](http://localhost:3000) to use the dashboard. The main UI lives in `src/app/page.tsx`, featuring:

- Module selector (Reflex/Mindset/Deep Dive)
- /themes resolver (CN/EN)
- Mic capture stub posting audio chunks to `/transcribe`

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [Learn Next.js](https://nextjs.org/learn)

## Deploy on Vercel

Deploy via [Vercel](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) or follow the [official deployment docs](https://nextjs.org/docs/app/building-your-application/deploying).
