import React, { useState } from 'react';
import { useAuth } from "../context/useAuth";
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import { Container, Box, TextField, Button, Typography, Alert, CircularProgress, Card, CardContent, Avatar, Grow } from '@mui/material';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';

function LoginPage() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (event) => {
        event.preventDefault();
        setError('');
        setLoading(true);
        try {
            await login(username, password);
            setSuccess(true);
            setTimeout(() => navigate('/'), 2000);
        } catch (err) {
            setError(err.response?.data?.msg || err.message || 'Login failed. Please check credentials.');
            setLoading(false);
        }
    };

    return (
        <Box
            sx={{
                minHeight: '100vh',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                background: 'linear-gradient(135deg, #6a11cb 0%, #2575fc 100%)',
                padding: 2,
            }}
        >
            <Grow in={!success} timeout={800}>
                <Card sx={{ maxWidth: 400, width: '100%', boxShadow: 3, borderRadius: 2 }}>
                    <CardContent>
                        <Box
                            sx={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                marginBottom: 3,
                            }}
                        >
                            <Avatar 
                            src="/LLbg.png" 
                            alt="Logo" 
                            sx={{ width: 80, height: 80, mb: 2 }} 
                            />

                            {/* Site Name */}
                            <Typography component="h1" variant="h4" sx={{ fontWeight: 'bold', textAlign: 'center' }}>
                                LastLeap
                            </Typography>
                            {/* Tagline */}
                            <Typography variant="body1" sx={{ color: 'text.secondary', textAlign: 'center', mt: 1 }}>
                                When time's tight, take the smart flight
                            </Typography>
                        </Box>
                        <Box
                            sx={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                marginBottom: 2,
                            }}
                        >
                            <Avatar sx={{ m: 1, bgcolor: 'secondary.main' }}>
                                <LockOutlinedIcon />
                            </Avatar>
                            <Typography component="h1" variant="h5" sx={{ fontWeight: 'bold' }}>
                                Sign in
                            </Typography>
                        </Box>
                        <Box component="form" onSubmit={handleSubmit} noValidate>
                            {error && <Alert severity="error" sx={{ width: '100%', mb: 2 }}>{error}</Alert>}
                            <TextField
                                margin="normal"
                                required
                                fullWidth
                                id="username"
                                label="Username"
                                name="username"
                                autoComplete="username"
                                autoFocus
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                disabled={loading}
                            />
                            <TextField
                                margin="normal"
                                required
                                fullWidth
                                name="password"
                                label="Password"
                                type="password"
                                id="password"
                                autoComplete="current-password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                disabled={loading}
                            />
                            <Button
                                type="submit"
                                fullWidth
                                variant="contained"
                                sx={{
                                    mt: 3,
                                    mb: 2,
                                    backgroundColor: 'primary.main',
                                    '&:hover': { backgroundColor: 'primary.dark' },
                                }}
                                disabled={loading}
                            >
                                {loading ? <CircularProgress size={24} color="inherit" /> : 'Sign In'}
                            </Button>
                            <Box textAlign="center">
                                <Typography variant="body2" sx={{ mt: 1 }}>
                                    <RouterLink to="/register" style={{ textDecoration: 'none', color: '#1976d2' }}>
                                        {"Don't have an account? Sign Up"}
                                    </RouterLink>
                                </Typography>
                            </Box>
                        </Box>
                    </CardContent>
                </Card>
            </Grow>
            {success && (
                <Box
                    sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        backgroundColor: 'rgba(0, 0, 0, 0.7)',
                        animation: 'fadeIn 1s ease-in-out',
                    }}
                >
                    <CheckCircleOutlineIcon sx={{ fontSize: 80, color: 'white', mb: 2 }} />
                    <Typography
                        variant="h4"
                        sx={{
                            color: 'white',
                            fontWeight: 'bold',
                            textAlign: 'center',
                        }}
                    >
                        Login Successful!
                    </Typography>
                </Box>
            )}
        </Box>
    );
}

export default LoginPage;