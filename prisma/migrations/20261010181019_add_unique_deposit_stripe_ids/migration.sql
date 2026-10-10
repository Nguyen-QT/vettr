-- CreateIndex
CREATE UNIQUE INDEX "BookingRequest_stripePaymentIntentId_key" ON "BookingRequest"("stripePaymentIntentId");

-- CreateIndex
CREATE UNIQUE INDEX "BookingRequest_stripeRefundId_key" ON "BookingRequest"("stripeRefundId");

