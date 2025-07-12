// src/context/useAuth.jsx
import { useContext } from 'react';
import { AuthContext } from './authContextDefinition'; // Import AuthContext (might need adjustment)

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) { // Corrected condition check
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};