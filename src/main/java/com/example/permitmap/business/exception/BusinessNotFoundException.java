package com.example.permitmap.business.exception;

public class BusinessNotFoundException extends RuntimeException {
  @java.io.Serial private static final long serialVersionUID = 1L;

  public BusinessNotFoundException() {
    super("인허가 사업장을 찾을 수 없습니다.");
  }
}
