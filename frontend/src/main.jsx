import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { AuthProvider } from './context/AuthContext.jsx'; // Import AuthProvider
import { BrowserRouter } from 'react-router-dom'; // Import BrowserRouter

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter> {/* Wrap with BrowserRouter */}
      <AuthProvider> {/* Wrap with AuthProvider */}
        <LocalizationProvider dateAdapter={AdapterDateFns}>
          <App /> {/* App component will now handle internal routing */}
        </LocalizationProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);