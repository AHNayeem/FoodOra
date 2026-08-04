# FOODORA — Vertical Slice Backend Integration

## Phase V1 — Complete Order → Delivery Flow (Client Demo)

You are working on the existing FoodOra project.

## IMPORTANT

Do NOT rebuild the application.

Do NOT redesign any frontend.

Do NOT change any UI unless a tiny adjustment is required for backend integration.

The frontend prototype is already completed.

Backend Foundation (E1), Authentication (E2), and Core Modules (E3) already exist.

Your responsibility is to replace ONLY the required mock APIs for one complete business flow.

---

# Goal

Implement ONE complete production-ready business flow:

Customer places an order →

Restaurant receives →

Restaurant accepts →

Kitchen prepares →

Food ready →

Rider assigned →

Rider picks up →

OTP verification →

Delivered →

Order completed

The purpose is to demonstrate the complete business lifecycle using real database records instead of mock data.

This implementation should become the foundation for the remaining backend modules.

---

# CRITICAL RULES

Before writing any code:

1. Analyze the existing frontend.
2. Find every screen involved in the ordering flow.
3. Identify every mock API.
4. Identify every mock service.
5. Identify every mock type.
6. Identify every state management dependency.
7. Preserve all existing UI behavior.
8. Preserve routes.
9. Preserve component props.
10. Preserve TypeScript interfaces whenever possible.
11. Replace only the data source.

The frontend should continue working after every small implementation.

Never perform a large refactor.

---

# PHASE 1

## Analyze Existing Frontend

Generate a report.

Include:

Customer Flow

Restaurant Flow

Kitchen Flow

Rider Flow

Admin Flow

For each screen identify:

Page

Components

Hooks

Mock data

Mock service

Types

Expected GraphQL API

Required backend entity

Required database table

Stop after the report and wait for implementation.

---

# PHASE 2

## Database

Create only the tables required for this flow.

Examples

Users

Addresses

Restaurants

Restaurant Branches

Menu Categories

Foods

Food Variants

Food Addons

Cart

Cart Items

Orders

Order Items

Order Status History

Delivery Assignment

Riders

OTP Verification

Payments

Coupons (basic)

Taxes (basic)

Notification Queue

Audit Log

Each table should include:

UUID PK

createdAt

updatedAt

deletedAt

version

createdBy

updatedBy

Indexes

Foreign Keys

Constraints

Soft Delete

Optimistic Locking

---

# PHASE 3

## Prisma

Generate production-ready Prisma schema.

Requirements

Relation names

Indexes

Composite indexes

Enums

Soft delete support

Performance optimized

Migration ready

---

# PHASE 4

## GraphQL

Generate only APIs needed for this order lifecycle.

Queries

Current Cart

Restaurant Menu

Checkout Summary

Order Details

Current Order Status

My Orders

Restaurant Active Orders

Kitchen Queue

Assigned Rider

Mutations

Add To Cart

Update Cart

Remove Item

Apply Coupon

Checkout

Restaurant Accept Order

Restaurant Reject Order

Start Cooking

Food Ready

Assign Rider

Accept Delivery

Pickup Order

Verify Delivery OTP

Complete Delivery

Cancel Order

Subscriptions

Order Status Updated

Kitchen Queue Updated

Rider Location Updated

Restaurant Dashboard Updated

Notification Received

Use cursor pagination where needed.

---

# PHASE 5

## Backend Modules

Create only these modules.

Cart

Checkout

Orders

Order Items

Kitchen

Restaurant Orders

Delivery

Rider Assignment

OTP

Payment (Mock Provider)

Notification

Each module should follow

Clean Architecture

Domain

Application

Infrastructure

Presentation

Dependency Injection

SOLID

Repository Pattern

---

# PHASE 6

## Order State Machine

Implement the complete lifecycle.

Draft

↓

Pending Payment

↓

Paid

↓

Pending Restaurant

↓

Accepted

↓

Preparing

↓

Ready

↓

Rider Assigned

↓

Picked Up

↓

On The Way

↓

OTP Verification

↓

Delivered

↓

Completed

Also support

Cancelled

Rejected

Expired

Refunded

Each transition must be validated.

Illegal transitions must fail.

---

# PHASE 7

## Restaurant Workflow

Restaurant receives new order.

Restaurant can

Accept

Reject

Estimate preparation time

Kitchen automatically receives accepted orders.

Kitchen can

Start Cooking

Pause

Ready

Restaurant dashboard updates instantly.

---

# PHASE 8

## Rider Workflow

Restaurant requests rider.

Assignment created.

Rider accepts.

Live status updates.

Pickup confirmation.

Delivery starts.

Customer receives OTP.

Rider submits OTP.

Delivery completed.

Order completed.

Wallet updated.

Order history updated.

---

# PHASE 9

## Notifications

Implement

In App

WebSocket

Firebase-ready abstraction

Notify

Customer

Restaurant

Kitchen

Rider

Admin

Events

Order Accepted

Preparing

Ready

Rider Assigned

Picked Up

Arriving

Delivered

OTP Generated

OTP Verified

---

# PHASE 10

## Real-time

Implement WebSocket events for

New Order

Kitchen Queue

Order Status

Rider Assignment

Rider Tracking (mock coordinates)

Notifications

Restaurant Dashboard

Use Redis Pub/Sub compatible architecture.

---

# PHASE 11

## Payment

Implement provider abstraction.

For now create

Mock Payment Gateway

Later adapters can replace it.

Support

Success

Failure

Timeout

Refund

---

# PHASE 12

## Seed Data

Generate realistic seed data.

Countries

Currencies

Restaurant

Restaurant Branch

Menus

Foods

Variants

Addons

Coupons

Customers

Restaurant Staff

Kitchen Staff

Riders

Orders in every status

OTP

Payment records

This should allow immediate client demo.

---

# PHASE 13

## Frontend Integration

Replace ONLY mock APIs.

Keep

Routes

Components

Hooks

UI

Design

Animations

Loading

Error States

Types

unchanged.

If a GraphQL response differs from mock data, adapt the backend—not the frontend—whenever practical.

---

# PHASE 14

## Demo Scenario

Prepare a complete demo using real database data.

Scenario:

1. Customer logs in.
2. Browses restaurant.
3. Adds items to cart.
4. Applies coupon.
5. Checks out.
6. Payment succeeds.
7. Restaurant receives order.
8. Restaurant accepts.
9. Kitchen starts preparing.
10. Food becomes ready.
11. Rider is assigned.
12. Rider accepts delivery.
13. Rider picks up order.
14. Customer receives OTP.
15. Rider verifies OTP.
16. Order delivered.
17. Order completed.
18. Notifications are sent to all parties.
19. Status updates appear in real time.
20. Audit logs are recorded.

---

# IMPLEMENTATION STRATEGY

Do NOT implement everything in one response.

Work incrementally.

For every step:

1. Analyze current code.
2. Explain impact.
3. Implement only one logical unit.
4. Verify compatibility.
5. Stop and wait for approval.

Never continue automatically.

---

# CODE QUALITY

Use

NestJS

GraphQL Apollo

Prisma

PostgreSQL

Redis

BullMQ

JWT

Refresh Token

Docker

S3 Compatible Storage

Firebase-ready notification abstraction

WebSocket Gateway

Repository Pattern

DTO Validation

Global Exception Filter

Structured Logging

Transactions where required

Optimistic Locking

Comprehensive comments only where they add value.

Production-ready code only.

The objective is to create a stable, end-to-end Order-to-Delivery workflow that fully replaces the frontend mock layer for this business process while preserving the existing UI and serving as the foundation for future backend modules.
Update memory and docs if a feature is done.


# Follow Current Project Structure

foodora/
|
├── frontend/
│   └── Next.js
│
├── backend/
│   └── NestJS
│
├── database/
│
├── docs/
│
└── docker/