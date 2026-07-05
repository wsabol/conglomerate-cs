import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./lib/auth";
import { AppShell } from "./components/shell";
import { RequireEditor } from "./components/RequireEditor";
import Home from "./routes/Home";
import Timeline from "./routes/Timeline";
import Performances from "./routes/Performances";
import EventDetail from "./routes/EventDetail";
import EventForm from "./routes/EventForm";
import Media from "./routes/Media";
import Admin from "./routes/Admin";
import SignIn from "./routes/SignIn";
import Styleguide from "./routes/Styleguide";
import NotFound from "./routes/NotFound";

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/signin" element={<SignIn />} />
          <Route element={<AppShell />}>
            <Route path="/" element={<Home />} />
            <Route path="/timeline" element={<Timeline />} />
            <Route path="/performances" element={<Performances />} />
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
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
