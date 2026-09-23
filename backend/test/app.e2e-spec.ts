import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  it('POST /chat/stream should keep the text SSE contract', async () => {
    const response = await request(app.getHttpServer())
      .post('/chat/stream')
      .send({ message: '你好' })
      .expect(200)
      .expect('Content-Type', /text\/event-stream/);

    expect(response.text).toContain('"type":"start"');
    expect(response.text).toContain('"type":"chunk"');
    expect(response.text).toContain('"type":"done"');
  }, 10000);

  it('POST /chat-md/stream should keep the markdown SSE contract', async () => {
    const response = await request(app.getHttpServer())
      .post('/chat-md/stream')
      .send({ message: '表格' })
      .expect(200)
      .expect('Content-Type', /text\/event-stream/);

    expect(response.text).toContain('"type":"start"');
    expect(response.text).toContain('"type":"chunk"');
    expect(response.text).toContain('"type":"done"');
  }, 10000);

  it('POST /agent/chat/stream should expose an isolated SSE endpoint', async () => {
    const response = await request(app.getHttpServer())
      .post('/agent/chat/stream')
      .send({ message: '你好' })
      .expect(200)
      .expect('Content-Type', /text\/event-stream/);

    expect(response.text).toContain('"type":"agent_started"');
    expect(response.text).toContain('"type":"agent_error"');
    expect(response.text).toContain('DEEPSEEK_API_KEY 未配置');
  });

  it('POST /agent/chat/stream should reject an empty message', () => {
    return request(app.getHttpServer())
      .post('/agent/chat/stream')
      .send({ message: '  ' })
      .expect(400)
      .expect(({ body }) => {
        expect(body.message).toBe('message 必须是非空字符串');
      });
  });
});
