import { Injectable } from '@nestjs/common';
import type { AgentTool } from './calculator.tool';

interface GeocodingResponse {
  results?: Array<{
    name?: string;
    latitude?: number;
    longitude?: number;
    country?: string;
    timezone?: string;
  }>;
}

interface ForecastResponse {
  current?: {
    temperature_2m?: number;
    wind_speed_10m?: number;
    weather_code?: number;
  };
  current_units?: {
    temperature_2m?: string;
    wind_speed_10m?: string;
  };
}

@Injectable()
export class WeatherTool implements AgentTool {
  name = 'weather';
  description = '查询指定城市的当前天气、温度和风速。';
  definition = {
    type: 'function' as const,
    function: {
      name: this.name,
      description: this.description,
      parameters: {
        type: 'object',
        properties: {
          city: {
            type: 'string',
            description: '城市名称，例如杭州、北京或 Tokyo',
          },
        },
        required: ['city'],
        additionalProperties: false,
      },
    },
  };

  async execute(input: unknown, signal?: AbortSignal) {
    if (!input || typeof input !== 'object' || !('city' in input)) {
      throw new Error('weather 参数必须包含 city');
    }

    const city = (input as { city: unknown }).city;
    if (typeof city !== 'string' || !city.trim()) {
      throw new Error('city 必须是非空字符串');
    }
    if (city.length > 100) throw new Error('city 过长');

    const timeoutMs = this.readTimeout();
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);
    const abortExternal = () => controller.abort();
    signal?.addEventListener('abort', abortExternal, { once: true });

    try {
      const location = await this.fetchJson<GeocodingResponse>(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city.trim())}&count=1&language=zh&format=json`,
        controller.signal,
      );
      const place = location.results?.[0];
      if (
        !place ||
        place.latitude === undefined ||
        place.longitude === undefined
      ) {
        throw new Error(`找不到城市：${city.trim()}`);
      }

      const forecast = await this.fetchJson<ForecastResponse>(
        `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,weather_code,wind_speed_10m&timezone=auto`,
        controller.signal,
      );
      if (!forecast.current) throw new Error('天气服务未返回当前天气');

      return {
        city: place.name ?? city.trim(),
        country: place.country,
        timezone: place.timezone,
        temperature: forecast.current.temperature_2m,
        temperatureUnit: forecast.current_units?.temperature_2m,
        windSpeed: forecast.current.wind_speed_10m,
        windSpeedUnit: forecast.current_units?.wind_speed_10m,
        weatherCode: forecast.current.weather_code,
        source: 'open-meteo',
      };
    } catch (error) {
      if (signal?.aborted) throw new Error('天气任务已取消');
      if (controller.signal.aborted) throw new Error('天气服务超时');
      if (error instanceof Error && error.message.startsWith('找不到城市'))
        throw error;
      throw new Error('天气服务暂时不可用');
    } finally {
      clearTimeout(timeoutHandle);
      signal?.removeEventListener('abort', abortExternal);
    }
  }

  private async fetchJson<T>(url: string, signal: AbortSignal): Promise<T> {
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`天气服务 HTTP ${response.status}`);
    return (await response.json()) as T;
  }

  private readTimeout() {
    const value = Number.parseInt(process.env.WEATHER_TIMEOUT_MS ?? '', 10);
    if (!Number.isInteger(value) || value < 100) return 5000;
    return Math.min(value, 30000);
  }
}
