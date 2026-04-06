<template>
  <div class="min-h-screen flex items-center justify-center bg-surface-50 dark:bg-surface-900 p-4">
    <Card class="w-full max-w-md shadow-xl">
      <template #header>
        <div class="px-8 pt-8 pb-2 text-center">
          <i class="pi pi-lock text-4xl text-primary mb-4 block" />
          <h1 class="text-2xl font-bold text-surface-900 dark:text-surface-0 m-0">Welcome back</h1>
          <p class="text-surface-500 mt-2 mb-0">Sign in to your account</p>
        </div>
      </template>
      <template #content>
        <form @submit.prevent="handleLogin" class="flex flex-col gap-5 px-2">
          <div class="flex flex-col gap-2">
            <label for="username" class="font-semibold text-sm">Username</label>
            <InputText
              id="username"
              v-model="username"
              placeholder="Enter your username"
              :disabled="loading"
              fluid
              autocomplete="username"
            />
          </div>
          <div class="flex flex-col gap-2">
            <label for="password" class="font-semibold text-sm">Password</label>
            <Password
              id="password"
              v-model="password"
              placeholder="Enter your password"
              :disabled="loading"
              :feedback="false"
              fluid
              toggleMask
              autocomplete="current-password"
            />
          </div>
          <Message v-if="error" severity="error" :closable="false">{{ error }}</Message>
          <Button
            type="submit"
            label="Sign In"
            icon="pi pi-sign-in"
            :loading="loading"
            fluid
            class="mt-1"
          />
        </form>
      </template>
      <template #footer>
        <div class="text-center text-sm text-surface-500 pb-2">
          Don't have an account?
          <NuxtLink to="/register" class="text-primary font-medium ml-1 hover:underline">Create one</NuxtLink>
        </div>
      </template>
    </Card>
  </div>
</template>

<script setup>
import Card from 'primevue/card'
import InputText from 'primevue/inputtext'
import Password from 'primevue/password'
import Button from 'primevue/button'
import Message from 'primevue/message'
const { login } = useAuth()
const username = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')

async function handleLogin() {
  loading.value = true
  error.value = ''
  try {
    await login(username.value, password.value)
    await navigateTo('/')
  } catch (err) {
    error.value = err?.data?.error || err?.message || 'Login failed'
  } finally {
    loading.value = false
  }
}
</script>
