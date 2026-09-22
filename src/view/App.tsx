import { DevToolbar } from "./components/DevToolbar.tsx";
import type { PageData } from "./pageData.ts";
import { Dashboard } from "./pages/Dashboard.tsx";
import { DonePage } from "./pages/DonePage.tsx";

export function App({ data }: { data: PageData }) {
  return (
    <>
      {data.dev && <DevToolbar dev={data.dev} />}
      {data.page === "done" ? (
        <DonePage done={data.done} health={data.health} />
      ) : (
        <Dashboard initialState={data.state} />
      )}
    </>
  );
}
