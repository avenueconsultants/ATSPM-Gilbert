// #region license
// Copyright 2024 Utah Departement of Transportation
// for WebUI - axios.ts
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//http://www.apache.org/licenses/LICENSE-2.
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
// #endregion
import { getEnv } from '@/utils/getEnv'
import axios, { AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios'
import Cookies from 'js-cookie'

export let configAxios: ReturnType<typeof createAxiosInstance>
export let reportsAxios: ReturnType<typeof createAxiosInstance>
export let identityAxios: ReturnType<typeof createAxiosInstance>
export let dataAxios: ReturnType<typeof createAxiosInstance>
export let speedAxios: ReturnType<typeof createAxiosInstance>

const BASE_PATH = '/api/v1/'

export const initializeAxiosInstances = async () => {
  const env = await getEnv()

  if (!env) {
    return
  }

  if (env.CONFIG_URL) {
    configAxios = createAxiosInstance(env.CONFIG_URL + BASE_PATH)
    configAxios.interceptors.response.use(
      (responseData) => {
        stripZFromDates(responseData)
        return responseData
      },
      (error) => Promise.reject(error)
    )
  }
  if (env.REPORTS_URL) {
    reportsAxios = createAxiosInstance(env.REPORTS_URL)
  }
  if (env.IDENTITY_URL) {
    identityAxios = createAxiosInstance(env.IDENTITY_URL + BASE_PATH)
  }
  if (env.DATA_URL) {
    dataAxios = createAxiosInstance(env.DATA_URL)
  }
  if (env.SPEED_URL) {
    speedAxios = createAxiosInstance(env.SPEED_URL + BASE_PATH)
  }
}

function createAxiosInstance(baseURL: string) {
  const instance = axios.create({ baseURL })

  instance.interceptors.request.use(authRequestInterceptor)
  instance.interceptors.response.use(
    (response) => {
      return response.data
    },
    (error) => Promise.reject(error)
  )

  return instance
}

// Request interceptor to add the Authorization header
function authRequestInterceptor(config: InternalAxiosRequestConfig) {
  const token = Cookies.get('token')
  if (token) {
    config.headers.authorization = `Bearer ${token}`
  }
  return config
}

type RequestConfig = Omit<AxiosRequestConfig, 'headers' | 'data' | 'signal'> &
  RequestInit & {
    data?: AxiosRequestConfig['data']
    headers?: AxiosRequestConfig['headers'] | HeadersInit
    signal?: AxiosRequestConfig['signal'] | AbortSignal | null
  }

function normalizeHeaders(
  headers?: RequestConfig['headers']
): AxiosRequestConfig['headers'] {
  if (!headers) {
    return undefined
  }

  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries())
  }

  if (Array.isArray(headers)) {
    return Object.fromEntries(headers)
  }

  return headers
}

function normalizeRequestConfig(config?: RequestConfig): AxiosRequestConfig {
  if (!config) {
    return {}
  }

  const { body, data, headers, ...rest } = config

  return {
    ...(rest as AxiosRequestConfig),
    headers: normalizeHeaders(headers),
    data: data ?? body,
  }
}

function createRequestConfig(
  urlOrConfig: string | RequestConfig,
  config?: RequestConfig
): AxiosRequestConfig {
  if (typeof urlOrConfig === 'string') {
    return {
      ...normalizeRequestConfig(config),
      url: urlOrConfig,
    }
  }

  return normalizeRequestConfig(urlOrConfig)
}

function requestWithClient<T>(
  client: ReturnType<typeof createAxiosInstance>,
  urlOrConfig: string | RequestConfig,
  config?: RequestConfig
): Promise<T> {
  return client.request<unknown, T>(createRequestConfig(urlOrConfig, config))
}

export function configRequest<T>(config: RequestConfig): Promise<T>
export function configRequest<T>(url: string, config?: RequestConfig): Promise<T>
export function configRequest<T>(
  urlOrConfig: string | RequestConfig,
  config?: RequestConfig
): Promise<T> {
  return requestWithClient<T>(configAxios, urlOrConfig, config)
}

export function reportsRequest<T>(config: RequestConfig): Promise<T>
export function reportsRequest<T>(
  url: string,
  config?: RequestConfig
): Promise<T>
export function reportsRequest<T>(
  urlOrConfig: string | RequestConfig,
  config?: RequestConfig
): Promise<T> {
  return requestWithClient<T>(reportsAxios, urlOrConfig, config)
}

export function identityRequest<T>(config: RequestConfig): Promise<T>
export function identityRequest<T>(
  url: string,
  config?: RequestConfig
): Promise<T>
export function identityRequest<T>(
  urlOrConfig: string | RequestConfig,
  config?: RequestConfig
): Promise<T> {
  return requestWithClient<T>(identityAxios, urlOrConfig, config)
}

export function dataRequest<T>(config: RequestConfig): Promise<T>
export function dataRequest<T>(url: string, config?: RequestConfig): Promise<T>
export function dataRequest<T>(
  urlOrConfig: string | RequestConfig,
  config?: RequestConfig
): Promise<T> {
  return requestWithClient<T>(dataAxios, urlOrConfig, config)
}

export function speedRequest<T>(config: RequestConfig): Promise<T>
export function speedRequest<T>(
  url: string,
  config?: RequestConfig
): Promise<T>
export function speedRequest<T>(
  urlOrConfig: string | RequestConfig,
  config?: RequestConfig
): Promise<T> {
  return requestWithClient<T>(speedAxios, urlOrConfig, config)
}

function stripZFromDates(data: any): void {
  if (Array.isArray(data)) {
    for (let i = 0; i < data.length; i++) {
      if (typeof data[i] === 'object' && data[i] !== null) {
        stripZFromDates(data[i])
      } else if (typeof data[i] === 'string' && isIsoTimestamp(data[i])) {
        data[i] = data[i].replace(/Z$/, '')
      }
    }
  } else if (data && typeof data === 'object') {
    for (const key of Object.keys(data)) {
      const value = data[key]
      if (value !== null && typeof value === 'object') {
        stripZFromDates(value)
      } else if (typeof value === 'string' && isIsoTimestamp(value)) {
        data[key] = value.replace(/Z$/, '')
      }
    }
  }
}

function isIsoTimestamp(str: string): boolean {
  // matches e.g. 2025-02-18T23:59:59, optionally followed by .digits, and optional Z
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z?$/.test(str)
}
