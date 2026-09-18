import { BrowserRouter, Outlet, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./lib/auth";
import { AppShell } from "./components/shell";
import { RequireEditor } from "./components/RequireEditor";
import Home from "./routes/Home";
import Timeline from "./routes/Timeline";
import Performances from "./routes/Performances";
import Events from "./routes/Events";
import EventDetail from "./routes/EventDetail";
import EventForm from "./routes/EventForm";
import Media from "./routes/Media";
import Admin from "./routes/Admin";
import Welcome from "./routes/Welcome";
import AuthComplete from "./routes/AuthComplete";
import Styleguide from "./routes/Styleguide";
import NotFound from "./routes/NotFound";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/welcome" element={<Welcome />} />
        <Route path="/auth/complete" element={<AuthComplete />} />
        <Route element={<AuthProvider><Outlet /></AuthProvider>}>
          <Route element={<AppShell />}>
            <Route path="/" element={<Home />} />
            <Route path="/timeline" element={<Timeline />} />
            <Route path="/performances" element={<Performances />} />
            <Route path="/events" element={<Events />} />
            <Route
              path="/events/new"
              element={
                <RequireEditor>
                  <EventForm mode="new" />
                </RequireEditor>
              }
            />
            <Route path="/events/:slug" element={<EventDetail />} />
            <Route
              path="/events/:slug/edit"
              element={
                <RequireEditor>
                  <EventForm mode="edit" />
                </RequireEditor>
              }
            />
            <Route path="/media" element={<Media />} />
            <Route
              path="/admin"
              element={
                <RequireEditor>
                  <Admin />
                </RequireEditor>
              }
            />
            <Route path="/styleguide" element={<Styleguide />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
