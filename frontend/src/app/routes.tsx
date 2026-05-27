import { createBrowserRouter } from "react-router";
import { OwnerDashboard } from "./components/OwnerDashboard";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: OwnerDashboard,
  },
]);
