<template>
  <div class="min-h-screen flex items-center justify-center bg-surface-50 dark:bg-surface-900 p-4">
    <Card class="w-full max-w-md shadow-xl">
      <template #header>
        <div class="px-8 pt-8 pb-2 text-center">
          <i class="pi pi-user-plus text-4xl text-primary mb-4 block" />
          <h1 class="text-2xl font-bold text-surface-900 dark:text-surface-0 m-0">Create account</h1>
          <p class="text-surface-500 mt-2 mb-0">Join us today</p>
        </div>
      </template>
      <template #content>
        <form @submit.prevent="handleRegister" class="flex flex-col gap-5 px-2">
          <div class="flex flex-col gap-2">
            <label for="username" class="font-semibold text-sm">Username</label>
            <InputText
              id="username"
              v-model="username"
              placeholder="Choose a username"
              :disabled="loading"
              fluid
              autocomplete="username"
            />
          </div>
          <div class="flex flex-col gap-2">
            <label for="email" class="font-semibold text-sm">Email</label>
            <InputText
              id="email"
              v-model="email"
              type="email"
              placeholder="you@example.com"
              :disabled="loading"
              fluid
              autocomplete="email"
            />
          </div>
          <div class="flex flex-col gap-2">
            <label for="password" class="font-semibold text-sm">Password</label>
            <Password
              id="password"
              v-model="password"
              placeholder="Min. 8 characters"
              :disabled="loading"
              fluid
              toggleMask
              autocomplete="new-password"
            />
          </div>
          <Message v-if="error" severity="error" :closable="false">{{ error }}</Message>

          <Button
            type="submit"
            label="Create Account"
            icon="pi pi-user-plus"
            :loading="loading"
            fluid
            class="mt-1"
          />
        </form>
      </template>
      <template #footer>
        <div class="text-center text-sm text-surface-500 pb-2">
          Already have an account?
          <NuxtLink to="/login" class="text-primary font-medium ml-1 hover:underline">Sign in</NuxtLink>
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
const { register } = useAuth()
const username = ref('')
const email = ref('')
const password = ref('')

const loading = ref(false)
const error = ref('')

async function handleRegister() {
  loading.value = true
  error.value = ''
  try {
    await register(username.value, password.value, email.value)
    await navigateTo('/')
  } catch (err) {
    error.value = err?.data?.error || err?.message || 'Registration failed'
  } finally {
    loading.value = false
  }
}
</script>
