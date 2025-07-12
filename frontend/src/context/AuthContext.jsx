import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { AuthContext } from './authContextDefinition';

// Create the Axios instance for API calls
const apiClient = axios.create({
    baseURL: 'http://127.0.0.1:5000/api' // Your backend API base URL
});


// Create Provider Component
export const AuthProvider = ({ children }) => {
    const [token, setToken] = useState(localStorage.getItem('authToken') || null);
    const [user, setUser] = useState(null); // Store basic user info {id, username}
    const [isLoading, setIsLoading] = useState(true); // Loading state for initial check

    // --- Axios Interceptor ---
    // Add a request interceptor to include the token in headers
    useEffect(() => {
        const requestInterceptor = apiClient.interceptors.request.use(
            (config) => {
                const currentToken = localStorage.getItem('authToken'); // Get fresh token
                if (currentToken) {
                    config.headers['Authorization'] = `Bearer ${currentToken}`;
                }
                return config;
            },
            (error) => {
                return Promise.reject(error);
            }
        );

         // Add a response interceptor to handle 401 errors (e.g., token expired)
         const responseInterceptor = apiClient.interceptors.response.use(
             (response) => response, // Do nothing on successful responses
             (error) => {
                 if (error.response && error.response.status === 401) {
                     // Token is invalid or expired, log out the user
                     console.error("Unauthorized or expired token, logging out.");
                     logout();
                     // Optionally redirect to login page or show a message
                     // window.location.href = '/login';
                 }
                 return Promise.reject(error);
             }
         );

        // Cleanup function to remove interceptors when component unmounts
        return () => {
            apiClient.interceptors.request.eject(requestInterceptor);
            apiClient.interceptors.response.eject(responseInterceptor);
        };
    }, []); // Run only once on mount

    // --- Fetch User on Load ---
    // Check if token exists and fetch user data when the app loads or token changes
    useEffect(() => {
        const fetchUser = async () => {
            const storedToken = localStorage.getItem('authToken');
            if (storedToken) {
                // console.log("Token found, fetching user..."); // Debug log
                setToken(storedToken); // Ensure token state is set
                try {
                    // Use the global apiClient which has the interceptor
                    const response = await apiClient.get('/user/me');
                    setUser(response.data);
                    // console.log("User fetched:", response.data); // Debug log
                } catch (error) {
                    console.error("Failed to fetch user with stored token:", error);
                    // Token might be invalid/expired, clear it
                    logout(); // Logout if fetching user fails
                }
            } else {
                 // console.log("No token found."); // Debug log
                 setUser(null); // Ensure user is null if no token
            }
            setIsLoading(false); // Finished initial check
        };

        fetchUser();
    }, []); // Run only once on initial mount

    // --- Login Function ---
    const login = async (username, password) => {
        try {
            const response = await apiClient.post('/login', { username, password });
            const { access_token } = response.data;
            localStorage.setItem('authToken', access_token);
            setToken(access_token);
            // Fetch user data immediately after login
            const userResponse = await apiClient.get('/user/me'); // apiClient now has the token via interceptor
            setUser(userResponse.data);
            return true; // Indicate login success
        } catch (error) {
            console.error("Login failed:", error);
            // Handle specific error messages from backend if available
            throw error; // Re-throw error to be caught in the component
        }
    };

    // --- Register Function ---
    const register = async (username, password) => {
         try {
             await apiClient.post('/register', { username, password });
             // Optionally log the user in directly after registration
             // return await login(username, password);
             return true; // Indicate registration success (user needs to login separately for now)
         } catch (error) {
             console.error("Registration failed:", error);
             throw error; // Re-throw error
         }
     };

    // --- Logout Function ---
    const logout = () => {
        localStorage.removeItem('authToken');
        setToken(null);
        setUser(null);
        // No need to interact with backend for simple JWT logout
    };

    // --- Value Provided by Context ---
    const value = {
        token,
        user,
        isAuthenticated: !!user, // True if user object exists
        isLoading, // To show loading state during initial check
        login,
        register,
        logout,
        apiClient // Expose the configured Axios instance
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// Expose apiClient if needed directly (though using useAuth().apiClient is better)
// export { apiClient };