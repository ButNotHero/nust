import { readFileSync } from 'fs';
import {
  Controller,
  Get,
  Header,
  HttpStatus,
  InternalServerErrorException,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { ViteDevServer } from 'vite';
import {
  getManifest,
  getRender,
  getTemplate,
  initProductionClient,
} from '@backend/utils/production';
import { FILE_CLIENT_PAGES } from '@backend/constants/files';
import { getClientRoutes } from '@backend/utils/client';
import { getViteServer } from './get-vite-server';
import { isProduction } from './utils/env';
import { resolveClientPath, resolveDistPath } from './utils/resolve-path';

const getRoutes = (): string[] => {
  if (isProduction) {
    const clientPages = readFileSync(resolveDistPath(FILE_CLIENT_PAGES), { encoding: 'utf-8' });
    return Array.from(clientPages.split(','));
  }

  return getClientRoutes();
};

let template: string;
let manifest: any;
let render: any;

@Controller(getRoutes())
export class AppController {
  constructor() {}

  @Get()
  @Header('Content-Type', 'text/html')
  async renderApp(@Req() request: Request, @Res() response: Response) {
    const url = request.originalUrl;
    let vite: ViteDevServer;

    try {
      if (isProduction) {
        const isInit = await initProductionClient();

        if (isInit) {
          template = getTemplate();
          manifest = getManifest();
          render = getRender();
        }
      } else {
        vite = await getViteServer();
        template = await vite.transformIndexHtml(
          url,
          readFileSync(resolveClientPath('index.html'), {
            encoding: 'utf-8',
          }),
        );
        render = (await vite.ssrLoadModule(resolveClientPath('entry-server.ts'))).render;
      }

      const { html, status, statusText, headers } = await render(url, {
        request,
        response,
        template,
        manifest,
        preload: true,
      });

      response.writeHead(status || HttpStatus.OK, statusText || headers, headers);
      response.end(html);
    } catch (error) {
      vite && vite.ssrFixStacktrace(error);
      throw new InternalServerErrorException(error);
    }
  }
}
