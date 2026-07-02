#!/bin/bash
# 智能皮肤路由测试脚本

echo "=========================================="
echo "智能皮肤路由功能测试"
echo "=========================================="
echo ""

BASE_URL="http://localhost:3001"
# 如果是生产环境，取消下面的注释
# BASE_URL="https://star-web.top"

echo "测试 1: 正版玩家（Notch）"
echo "UUID: 069a79f4-44e9-4726-a5be-fca90e38aaf5"
echo "预期: X-Player-Type: premium, X-Skin-Source: mojang-premium"
curl -s -D - "${BASE_URL}/api/public/skin-profile/Notch.json?uuid=069a79f4-44e9-4726-a5be-fca90e38aaf5" | grep -E "X-Player-Type|X-Skin-Source|HTTP/"
echo ""
echo "------------------------------------------"
echo ""

echo "测试 2: 离线玩家（TestPlayer）"
echo "UUID: 8667ba71-b85a-4004-af54-457a9734eed7"
echo "预期: X-Player-Type: offline, X-Skin-Source: default-offline"
curl -s -D - "${BASE_URL}/api/public/skin-profile/TestPlayer.json?uuid=8667ba71-b85a-4004-af54-457a9734eed7" | grep -E "X-Player-Type|X-Skin-Source|HTTP/"
echo ""
echo "------------------------------------------"
echo ""

echo "测试 3: 未知类型（无 UUID 参数）"
echo "预期: X-Player-Type: unknown, X-Skin-Source: fallback-chain"
curl -s -D - "${BASE_URL}/api/public/skin-profile/UnknownPlayer.json" | grep -E "X-Player-Type|X-Skin-Source|HTTP/"
echo ""
echo "------------------------------------------"
echo ""

echo "测试 4: 绑定用户（如果存在）"
echo "请替换为你网站上已绑定的真实用户名"
echo "预期: X-Skin-Source: website-bound"
# curl -s -D - "${BASE_URL}/api/public/skin-profile/YourBoundUser.json?uuid=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" | grep -E "X-Player-Type|X-Skin-Source|HTTP/"
echo ""
echo "=========================================="
echo "测试完成"
echo "=========================================="
