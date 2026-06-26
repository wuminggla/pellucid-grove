#!/usr/bin/env node
/**
 * 一键发版脚本: pnpm publish:tag <bump>
 *   bump: patch | minor | major (默认 patch)
 *
 * 流程:
 *   1. 检查工作区干净
 *   2. 跑测试(vitest run src/game)
 *   3. 跑构建(pnpm build)
 *   4. 凸版本号(package.json)
 *   5. git commit + tag v<ver>
 *   6. git push --follow-tags 触发 GitHub Actions 部署
 *   7. 打印新的 jsdelivr URL,提示更新角色卡里的引用
 *
 * 注:角色卡里建议用 @v<x.y.z> 锁版本而非 @latest,这样老存档玩家不会被新版本破坏。
 *    新版发布后,如要召回玩家:发新卡(或通过其他渠道告知更新版本号)。
 */

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PKG = path.join(ROOT, 'package.json');

const sh = (cmd) => execSync(cmd, { cwd: ROOT, stdio: 'inherit' });
const shOut = (cmd) => execSync(cmd, { cwd: ROOT }).toString().trim();

function bumpVersion(v, kind) {
  const [maj, min, pat] = v.split('.').map(Number);
  if (kind === 'major') return `${maj + 1}.0.0`;
  if (kind === 'minor') return `${maj}.${min + 1}.0`;
  return `${maj}.${min}.${pat + 1}`;
}

function main() {
  const kind = process.argv[2] ?? 'patch';
  if (!['patch', 'minor', 'major'].includes(kind)) {
    console.error('用法: pnpm publish:tag [patch|minor|major]');
    process.exit(1);
  }

  // 1. 工作区干净
  const dirty = shOut('git status --porcelain');
  if (dirty) {
    console.error('工作区不干净,先 commit 或 stash:');
    console.error(dirty);
    process.exit(1);
  }

  // 2. 测试
  console.log('\n[1/6] 跑测试...');
  sh('pnpm vitest run src/game');

  // 3. 构建(本地校验,实际生产由 Actions 重跑)
  console.log('\n[2/6] 本地构建校验...');
  sh('pnpm build');

  // 4. 凸版本
  const pkg = JSON.parse(readFileSync(PKG, 'utf8'));
  const oldVer = pkg.version;
  const newVer = bumpVersion(oldVer, kind);
  pkg.version = newVer;
  writeFileSync(PKG, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  console.log(`\n[3/6] 版本 ${oldVer} → ${newVer}`);

  // 5. commit + tag
  console.log('\n[4/6] git commit + tag...');
  sh(`git add package.json`);
  sh(`git commit -m "release: v${newVer}"`);
  sh(`git tag v${newVer}`);

  // 6. push
  console.log('\n[5/6] git push (触发 Actions 部署)...');
  sh('git push --follow-tags');

  // 7. 输出引用 URL
  const remote = shOut('git remote get-url origin');
  // 解析 GitHub 用户/仓库(支持 https/ssh 两种 remote 格式)
  const m = remote.match(/github\.com[:/]([^/]+)\/([^/.]+)/);
  const repoSlug = m ? `${m[1]}/${m[2]}` : '<user>/pellucid-grove';

  console.log(`\n[6/6] ✓ 发布完成`);
  console.log('────────────────────────────────────────');
  console.log(`版本: v${newVer}`);
  console.log('');
  console.log('部署 URL (gh-pages 分支根目录,jsdelivr 自动同步):');
  console.log(`  https://cdn.jsdelivr.net/gh/${repoSlug}@gh-pages/index.html`);
  console.log('');
  console.log('GitHub Pages 直链(备用):');
  console.log(`  https://${m?.[1] ?? '<user>'}.github.io/${m?.[2] ?? 'pellucid-grove'}/`);
  console.log('');
  console.log('版本锁定(发布给玩家时推荐):');
  console.log('  1. 等 Actions 跑完(~5min): https://github.com/' + repoSlug + '/actions');
  console.log('  2. 查 gh-pages 最新 commit:');
  console.log('     git fetch origin gh-pages');
  console.log('     git rev-parse origin/gh-pages   # 取前 7 位 sha');
  console.log(`  3. 锁版本 URL: https://cdn.jsdelivr.net/gh/${repoSlug}@<sha7>/index.html`);
  console.log('────────────────────────────────────────');
  console.log('下一步:');
  console.log('  - 等 5-10 分钟 Actions 跑完(gh-pages 分支生成/更新)');
  console.log('  - 在角色卡 状态栏正则 HTML 里改 iframe src(锁版本 sha 或 @gh-pages)');
  console.log('  - 重打包卡: node ~/.claude/skills/tavern-cards/scripts/tavern-cards-forge.mjs pack jiutiao');
}

main();
