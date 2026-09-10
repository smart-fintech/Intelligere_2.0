import React, { useEffect } from 'react';
import { Toaster } from '@/Components/ui/sonner';
import SocketProvider from '@/Context/SocketProvider';
import AppRoutes from '@/Routes/AppRoutes';
import {
  isLoggedIn,
  startInactivityWatch,
  stopInactivityWatch,
} from '@/Services/tokenService';

const App = () => {
  // Runs once when the app starts.
  //
  // A page reload loses the watcher started at login, so if there is still a
  // saved session we start it again here: it logs the user out after a long
  // stretch with no activity.
  useEffect(() => {
    if (!isLoggedIn()) return;

    startInactivityWatch();

    // Clean up if the app is ever unmounted, so no timer is left running.
    return () => {
      stopInactivityWatch();
    };
  }, []);

  return (
    <React.Fragment>
        {/* The one WebSocket for the whole app. It sits above the routes so a
          page change never drops the connection, and every screen reaches it
          with useWebSocket() instead of opening its own. */}
        <SocketProvider>
          {/* Every page of the app is chosen here, based on the current URL.
              The routing table itself lives in Routes/AppRoutes.jsx. */}
          <AppRoutes />
        </SocketProvider>

        {/* Placed once, here. Every toast in the project appears in this box. */}
        <Toaster />
    </React.Fragment>
  )
}

export default App;
