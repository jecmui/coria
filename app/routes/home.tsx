import type { Route } from "./+types/home";
import Login from "~/components/landing/login";
import Landing from "~/components/landing/landing";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "bullet" },
    { name: "description", content: "An app to help you focus on now." },
  ];
}

export default function Home() {
  return <Landing />;
}
