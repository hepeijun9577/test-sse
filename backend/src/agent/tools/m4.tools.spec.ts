import { KnowledgeSearchTool } from './knowledge-search.tool';
import { TimeTool } from './time.tool';
import { WeatherTool } from './weather.tool';

describe('M4 tools', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns an ISO timestamp from the time tool', async () => {
    const result = await new TimeTool().execute({});

    expect(result.iso).toEqual(expect.any(String));
    expect(result.timestamp).toEqual(expect.any(Number));
    expect(Number.isNaN(Date.parse(result.iso))).toBe(false);
  });

  it('searches the in-memory project knowledge', async () => {
    const result = await new KnowledgeSearchTool().execute({
      query: 'SSE 流式',
    });

    expect(result.source).toBe('in-memory-project-documents');
    expect(result.matches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: 'SSE 流式通信' }),
      ]),
    );
  });

  it('maps Open-Meteo responses into a weather result', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch');
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            results: [
              {
                name: '杭州',
                latitude: 30.27,
                longitude: 120.15,
                country: '中国',
                timezone: 'Asia/Shanghai',
              },
            ],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            current: {
              temperature_2m: 26,
              wind_speed_10m: 8,
              weather_code: 1,
            },
            current_units: {
              temperature_2m: '°C',
              wind_speed_10m: 'km/h',
            },
          }),
          { status: 200 },
        ),
      );

    const result = await new WeatherTool().execute({ city: '杭州' });

    expect(result).toMatchObject({
      city: '杭州',
      temperature: 26,
      windSpeed: 8,
      weatherCode: 1,
      source: 'open-meteo',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('maps weather provider failures to a stable tool error', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('upstream failure', { status: 503 }));

    await expect(new WeatherTool().execute({ city: '杭州' })).rejects.toThrow(
      '天气服务暂时不可用',
    );
  });
});
