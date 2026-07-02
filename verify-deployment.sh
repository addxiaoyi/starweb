#!/bin/bash
# 部署验证脚本 - 检查 star-web.top 更新状态和 bug

echo "=== 1. 检查网站可访问性 ==="
curl -sS -o /dev/null -w "HTTP Status: %{http_code}\nTime: %{time_total}s\n" https://star-web.top/skins

echo -e "\n=== 2. 检查前端构建版本（查找新组件） ==="
curl -sS https://star-web.top/skins | grep -o "Segmented\|ChipGroup\|SkinCardSkeleton" | head -3

echo -e "\n=== 3. 检查 JavaScript 错误（Console） ==="
curl -sS https://star-web.top/skins | grep -i "error\|undefined\|null is not" | head -5

echo -e "\n=== 4. 检查关键功能点 ==="
echo "- 检查分段控件..."
curl -sS https://star-web.top/skins | grep -o 'role="tab"' | wc -l
echo "个 tab 按钮找到"

echo -e "- 检查筛选组件..."
curl -sS https://star-web.top/skins | grep -o 'ChipGroup\|标签\|来源\|皮肤库' | wc -l
echo "个筛选相关元素找到"

echo -e "\n=== 5. 检查 Docker 容器状态 ==="
echo "（需要 SSH 到服务器执行：docker ps | grep starmc-web）"

echo -e "\n=== 6. 测试建议 ==="
echo "手动测试："
echo "1. 访问 https://star-web.top/skins"
echo "2. 点击 '皮肤/披风' 切换 - 应该平滑滑动"
echo "3. 切换 '最新/热度' 排序 - 应该平滑动画"
echo "4. 点击 '更多筛选' - 展开标签/来源等"
echo "5. 上传皮肤 - 检查预览和表单"
