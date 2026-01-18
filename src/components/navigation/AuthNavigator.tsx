// src/navigation/AuthNavigator.tsx
import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { LoginScreen } from '../../screens/auth/LoginScreen';
import { SignupScreen } from '../../screens/auth/SignupScreen';
import { ForgotPasswordScreen } from '../../screens/auth/ForgotPasswordScreen';

export type AuthStackParamList = {
  Login: undefined;
  Signup: undefined;
  ForgotPassword: { oobCode?: string } | undefined;
};

const Stack = createNativeStackNavigator<AuthStackParamList>();

export const AuthNavigator = () => {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Signup" component={SignupScreen} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
    </Stack.Navigator>
  );
};